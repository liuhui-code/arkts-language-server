use crate::{
    Runtime,
    maintenance::Input,
    protocol::{ProtocolError, Request},
    reader,
};
use serde_json::Value;
impl Runtime {
    pub(super) fn submit_read(&mut self, request: Request) -> Result<(), ProtocolError> {
        let observed = self
            .maintenance
            .as_ref()
            .and_then(|m| m.observed_input())
            .cloned();
        let input = if let Some(value) = request.params.get("input") {
            let input: Input = crate::parse_params(value.clone())?;
            input.validate()?;
            if observed.as_ref() != Some(&input) {
                return Err(ProtocolError::new(
                    "invalid_generation",
                    "read input is not the owners current observed input",
                ));
            }
            Some(input)
        } else {
            observed
        };
        self.readers
            .as_mut()
            .ok_or_else(crate::not_initialized)?
            .submit(request, input)
    }
    pub(super) fn read_control(
        &mut self,
        method: &str,
        params: Value,
    ) -> Result<Value, ProtocolError> {
        let readers = self.readers.as_mut().ok_or_else(|| {
            ProtocolError::new("incompatible", "reader capability was not negotiated")
        })?;
        match method {
            "index/cancel" => readers.cancel(params),
            "index/reader-status" => Ok(readers.status()),
            _ => Err(ProtocolError::new(
                "method_not_found",
                "unknown read control",
            )),
        }
    }
    pub(super) fn uses_readers(&self, method: &str) -> bool {
        self.readers.is_some() && reader::is_read(method)
    }
}
