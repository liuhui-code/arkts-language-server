use crate::Position;

pub(crate) struct LineIndex<'a> {
    pub(crate) text: &'a str,
    pub(crate) line_starts: Vec<usize>,
}

impl<'a> LineIndex<'a> {
    pub(crate) fn new(text: &'a str) -> Self {
        let mut line_starts = Vec::with_capacity(text.len() / 40 + 1);
        line_starts.push(0);
        line_starts.extend(
            text.bytes()
                .enumerate()
                .filter_map(|(offset, byte)| (byte == b'\n').then_some(offset + 1)),
        );
        Self { text, line_starts }
    }

    pub(crate) fn position(&self, byte_offset: usize) -> Position {
        let line = self
            .line_starts
            .partition_point(|line_start| *line_start <= byte_offset)
            .saturating_sub(1);
        let line_start = self.line_starts[line];
        let character = self.text[line_start..byte_offset].encode_utf16().count();
        Position::new(line as u32, character as u32)
    }
}
