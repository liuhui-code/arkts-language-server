//! Test-process-only observation of SQLite allocation requests, not live bytes/RSS.
use std::{
    ffi::{c_int, c_void},
    sync::{
        OnceLock,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
};

use rusqlite::ffi;

struct Original {
    malloc: unsafe extern "C" fn(c_int) -> *mut c_void,
    realloc: unsafe extern "C" fn(*mut c_void, c_int) -> *mut c_void,
}

static ORIGINAL: OnceLock<Original> = OnceLock::new();
static ENABLED: AtomicBool = AtomicBool::new(false);
static REQUESTS: AtomicUsize = AtomicUsize::new(0);

pub fn install_before_sqlite_initialization() {
    // The caller runs in an isolated child before opening any connection or thread.
    let mut methods: ffi::sqlite3_mem_methods = unsafe { std::mem::zeroed() };
    assert_eq!(
        unsafe {
            ffi::sqlite3_config(
                ffi::SQLITE_CONFIG_GETMALLOC,
                &mut methods as *mut ffi::sqlite3_mem_methods,
            )
        },
        ffi::SQLITE_OK,
    );
    assert!(
        ORIGINAL
            .set(Original {
                malloc: methods.xMalloc.expect("SQLite malloc callback"),
                realloc: methods.xRealloc.expect("SQLite realloc callback"),
            })
            .is_ok()
    );
    methods.xMalloc = Some(malloc);
    methods.xRealloc = Some(realloc);
    // Free/size/roundup/init/shutdown and pAppData retain their original ownership.
    assert_eq!(
        unsafe {
            ffi::sqlite3_config(
                ffi::SQLITE_CONFIG_MALLOC,
                &methods as *const ffi::sqlite3_mem_methods,
            )
        },
        ffi::SQLITE_OK,
    );
}

unsafe extern "C" fn malloc(size: c_int) -> *mut c_void {
    record();
    unsafe { (ORIGINAL.get().expect("installed original allocator").malloc)(size) }
}

unsafe extern "C" fn realloc(pointer: *mut c_void, size: c_int) -> *mut c_void {
    record();
    unsafe {
        (ORIGINAL
            .get()
            .expect("installed original allocator")
            .realloc)(pointer, size)
    }
}

fn record() {
    if ENABLED.load(Ordering::Relaxed) {
        REQUESTS.fetch_add(1, Ordering::Relaxed);
    }
}

pub fn measure<T>(operation: impl FnOnce() -> T) -> (T, usize) {
    assert!(
        !ENABLED.swap(true, Ordering::SeqCst),
        "allocation scopes cannot overlap"
    );
    REQUESTS.store(0, Ordering::SeqCst);
    struct Scope;
    impl Drop for Scope {
        fn drop(&mut self) {
            ENABLED.store(false, Ordering::SeqCst);
        }
    }
    let scope = Scope;
    let result = operation();
    let count = REQUESTS.load(Ordering::SeqCst);
    drop(scope);
    (result, count)
}
