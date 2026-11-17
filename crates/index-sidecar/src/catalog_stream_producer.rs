use super::super::{CatalogUpdate, observer, worker::CATALOG_CANCELLED};
pub(crate) use super::parse::Job;
use super::parse::{Outcome, Output};
use super::{
    Collected,
    pool::{Lease, Pool},
};
use arkts_index_core::{StoreError, StoreErrorKind};
use arkts_index_sqlite::CatalogInput;
use std::{
    cell::RefCell,
    sync::{
        Arc,
        atomic::{AtomicU8, Ordering},
        mpsc::Sender,
    },
};

/// Four fixed single-item escrow slots. A retained owner outlives task leases,
/// but a lease cannot end until every active slot has returned its real outcome.
pub(crate) struct Producer<'a> {
    pending: std::vec::IntoIter<Job>,
    pool: Lease<'a>,
    active_slots: usize,
    released: bool,
    remaining: usize,
    ordinal: usize,
    finished: bool,
    state: &'a Arc<AtomicU8>,
    updates: &'a Sender<CatalogUpdate>,
    generation: u64,
    collected: &'a RefCell<Collected>,
}
impl<'a> Producer<'a> {
    pub(crate) fn new(
        manifest: Vec<Job>,
        state: &'a Arc<AtomicU8>,
        updates: &'a Sender<CatalogUpdate>,
        generation: u64,
        collected: &'a RefCell<Collected>,
    ) -> Result<Self, StoreError> {
        Self::with_pool(
            manifest,
            state,
            updates,
            generation,
            collected,
            Lease::Owned(Pool::default()),
        )
    }
    pub(crate) fn retained(
        manifest: Vec<Job>,
        state: &'a Arc<AtomicU8>,
        updates: &'a Sender<CatalogUpdate>,
        generation: u64,
        collected: &'a RefCell<Collected>,
        pool: &'a mut Pool,
    ) -> Result<Self, StoreError> {
        Self::with_pool(
            manifest,
            state,
            updates,
            generation,
            collected,
            Lease::Retained(pool),
        )
    }
    fn with_pool(
        manifest: Vec<Job>,
        state: &'a Arc<AtomicU8>,
        updates: &'a Sender<CatalogUpdate>,
        generation: u64,
        collected: &'a RefCell<Collected>,
        mut pool: Lease<'a>,
    ) -> Result<Self, StoreError> {
        let remaining = manifest.len();
        pool.grow(remaining)?;
        let active_slots = remaining.min(super::super::PARSE_WORKERS);
        let mut this = Self {
            pending: manifest.into_iter(),
            pool,
            active_slots,
            released: false,
            remaining,
            ordinal: 0,
            finished: false,
            state,
            updates,
            generation,
            collected,
        };
        for index in 0..active_slots {
            this.dispatch(index)?;
        }
        Ok(this)
    }
    fn dispatch(&mut self, slot: usize) -> Result<(), StoreError> {
        if let Some(job) = self.pending.next() {
            self.pool.dispatch(slot, job, self.state)?;
        }
        Ok(())
    }
    fn join(&mut self) -> bool {
        if self.released {
            return true;
        }
        self.released = true;
        self.pool.release()
    }
    fn receive(&mut self, slot: usize) -> Result<Output, StoreError> {
        self.pool.receive(slot, self.state)
    }
    fn advance(&mut self) -> Result<CatalogInput, StoreError> {
        loop {
            if self.remaining == 0 {
                if !self.join() {
                    return Err(failure("catalog parser panicked"));
                }
                if !observer::begin_activation(
                    self.state,
                    self.updates,
                    self.generation,
                    &self.collected.borrow().progress,
                )
                .map_err(|error| failure(&error.1))?
                {
                    return Err(failure("catalog stream cancelled before activation"));
                }
                self.finished = true;
                return Ok(CatalogInput::Complete);
            }
            let slot = self.ordinal % self.active_slots;
            let output = self.receive(slot)?;
            self.ordinal += 1;
            self.remaining -= 1;
            if self.state.load(Ordering::Acquire) != CATALOG_CANCELLED {
                self.dispatch(slot)?;
            }
            let mut collected = self.collected.borrow_mut();
            if let Some(source) = output.source {
                if let Some(inputs) = &mut collected.inputs {
                    inputs.record_digest(&output.uri, source.digest());
                }
                collected.sources.push(source);
            }
            match output.outcome {
                Outcome::Parsed(document) => {
                    collected.progress.indexed += 1;
                    return Ok(CatalogInput::Document(document));
                }
                Outcome::Rejected => {
                    collected.progress.rejected += 1;
                    return Ok(CatalogInput::Rejected(output.uri));
                }
                Outcome::Skipped => collected.progress.policy_skipped += 1,
                Outcome::Changed => {
                    return Err(failure(
                        "workspace source changed between hash scan and parsing; rebuild required",
                    ));
                }
            }
        }
    }
}
impl Iterator for Producer<'_> {
    type Item = Result<CatalogInput, StoreError>;
    fn next(&mut self) -> Option<Self::Item> {
        if self.finished {
            return None;
        }
        let result = self.advance();
        if result.is_err() {
            self.finished = true;
        }
        Some(result)
    }
}
impl Drop for Producer<'_> {
    fn drop(&mut self) {
        self.join();
    }
}

fn failure(message: &str) -> StoreError {
    StoreError::new(StoreErrorKind::Internal, message)
}
