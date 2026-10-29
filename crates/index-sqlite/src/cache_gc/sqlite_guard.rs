//! Separate-process GC only. Never open/close another descriptor for this DB while held:
//! POSIX fcntl locks are process-owned and closing ANY descriptor for that inode releases them.
use std::{
    fs::{File, OpenOptions},
    path::Path,
};

pub(super) struct SqliteGuard {
    _file: File,
}

impl SqliteGuard {
    pub fn object_id(&self) -> Result<String, String> {
        super::files::file_object_id(&self._file)
    }
    pub fn acquire(path: &Path) -> Result<Self, String> {
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .open(path)
            .map_err(|e| e.to_string())?;
        lock(&file).map_err(|e| format!("sqlite-in-use-or-unverifiable: {e}"))?;
        Ok(Self { _file: file })
    }
}

#[cfg(unix)]
fn lock(file: &File) -> std::io::Result<()> {
    use std::os::fd::AsRawFd;
    let mut region: libc::flock = unsafe { std::mem::zeroed() };
    region.l_type = libc::F_WRLCK as _;
    region.l_whence = libc::SEEK_SET as _;
    region.l_start = 0x4000_0000;
    region.l_len = 512;
    if unsafe { libc::fcntl(file.as_raw_fd(), libc::F_SETLK, &region) } == -1 {
        return Err(std::io::Error::last_os_error());
    }
    Ok(())
}

#[cfg(windows)]
fn lock(file: &File) -> std::io::Result<()> {
    use std::{ffi::c_void, os::windows::io::AsRawHandle};
    #[repr(C)]
    struct Overlapped {
        internal: usize,
        internal_high: usize,
        offset: u32,
        offset_high: u32,
        event: *mut c_void,
    }
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn LockFileEx(
            handle: *mut c_void,
            flags: u32,
            reserved: u32,
            low: u32,
            high: u32,
            overlapped: *mut Overlapped,
        ) -> i32;
    }
    let mut region = Overlapped {
        internal: 0,
        internal_high: 0,
        offset: 0x4000_0000,
        offset_high: 0,
        event: std::ptr::null_mut(),
    };
    // FAIL_IMMEDIATELY | EXCLUSIVE_LOCK, exactly the fixed SQLite VFS pending/shared range.
    if unsafe { LockFileEx(file.as_raw_handle(), 3, 0, 512, 0, &mut region) } == 0 {
        return Err(std::io::Error::last_os_error());
    }
    Ok(())
}
