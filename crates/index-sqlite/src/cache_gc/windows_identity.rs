//! Win32 handle identity: creation time is not a file identifier.
use std::{ffi::c_void, fs::File, os::windows::io::AsRawHandle};

#[repr(C)]
struct Information {
    attributes: u32,
    creation: [u32; 2],
    access: [u32; 2],
    write: [u32; 2],
    volume: u32,
    size_high: u32,
    size_low: u32,
    links: u32,
    index_high: u32,
    index_low: u32,
}

pub(super) fn file_id(file: &File) -> Result<String, String> {
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetFileInformationByHandle(handle: *mut c_void, information: *mut Information) -> i32;
    }
    let mut info: Information = unsafe { std::mem::zeroed() };
    if unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut info) } == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    if info.attributes & 0x400 != 0
        || info.links > 1
        || info.volume == 0
        || (info.index_high == 0 && info.index_low == 0)
    {
        return Err("unsupported-file-identity".into());
    }
    Ok(format!(
        "{}:{}:{}",
        info.volume, info.index_high, info.index_low
    ))
}
