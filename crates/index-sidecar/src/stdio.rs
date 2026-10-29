use serde_json::Value;
use std::{
    io::{self, BufRead, Write},
    sync::{Mutex, mpsc::Sender},
    thread,
};

pub(crate) enum InputUpdate {
    Line(String),
    End,
    Error(String),
}

pub(crate) fn spawn_input_reader(sender: Sender<InputUpdate>) -> Result<(), String> {
    thread::Builder::new()
        .name("arkts-sidecar-stdin".to_owned())
        .spawn(move || {
            let stdin = io::stdin();
            for line in stdin.lock().lines() {
                match line {
                    Ok(line) => {
                        if sender.send(InputUpdate::Line(line)).is_err() {
                            return;
                        }
                    }
                    Err(error) => {
                        let _ = sender
                            .send(InputUpdate::Error(format!("failed to read stdin: {error}")));
                        return;
                    }
                }
            }
            let _ = sender.send(InputUpdate::End);
        })
        .map(|_| ())
        .map_err(|error| format!("failed to spawn stdin reader: {error}"))
}

pub(crate) fn write_response(writer: &Mutex<impl Write>, response: Value) -> Result<(), String> {
    let mut writer = writer
        .lock()
        .map_err(|_| "stdout writer mutex is poisoned".to_owned())?;
    serde_json::to_writer(&mut *writer, &response)
        .map_err(|error| format!("failed to serialize response: {error}"))?;
    writer
        .write_all(b"\n")
        .and_then(|()| writer.flush())
        .map_err(|error| format!("failed to write response: {error}"))
}
