use std::fmt::Write as _;

pub(super) fn relative_source_uri_candidates(owner_uri: &str, source: &str) -> Option<Vec<String>> {
    if !owner_uri.starts_with("file:///")
        || !(source.starts_with("./") || source.starts_with("../"))
        || source.contains(['?', '#', '\\'])
    {
        return None;
    }
    let owner_path = owner_uri.strip_prefix("file://")?;
    let parent_end = owner_path.rfind('/')?;
    let combined = format!(
        "{}/{}",
        &owner_path[..parent_end],
        percent_encode_uri_path(source.as_bytes())
    );
    let mut segments = Vec::new();
    for segment in combined.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                segments.pop()?;
            }
            value => segments.push(value),
        }
    }
    let base = format!("file:///{}", segments.join("/"));
    if [".ets", ".ts", ".d.ets", ".d.ts"]
        .iter()
        .any(|suffix| base.ends_with(suffix))
    {
        return Some(vec![base]);
    }
    Some(vec![
        format!("{base}.ets"),
        format!("{base}.ts"),
        format!("{base}.d.ets"),
        format!("{base}.d.ts"),
        format!("{base}/index.ets"),
        format!("{base}/index.ts"),
        format!("{base}/index.d.ets"),
        format!("{base}/index.d.ts"),
    ])
}

fn percent_encode_uri_path(bytes: &[u8]) -> String {
    let mut encoded = String::with_capacity(bytes.len());
    for byte in bytes {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~' | b'/' | b':') {
            encoded.push(char::from(*byte));
        } else {
            write!(&mut encoded, "%{byte:02X}").expect("writing to String cannot fail");
        }
    }
    encoded
}
