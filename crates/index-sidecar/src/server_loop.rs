use super::*;
pub(crate) fn run() -> Result<(), String> {
    let stdout = Mutex::new(io::stdout());
    let (input_sender, input_receiver) = mpsc::channel();
    spawn_input_reader(input_sender)?;
    let (catalog_sender, catalog_receiver) = mpsc::channel();
    let mut runtime = Runtime::default();
    let mut last_catalog_event = Instant::now();

    'server: loop {
        if let Some(readers) = runtime.readers.as_mut() {
            for response in readers.poll() {
                write_response(&stdout, response)?;
            }
        }
        if let Some(maintenance) = runtime.maintenance.as_mut() {
            for mut event in maintenance.poll() {
                event["protocol"] = json!(PROTOCOL_VERSION);
                if event["event"] == "maintenance/terminal" && event["currentInput"] == true {
                    runtime.committed_generation = event["qualification"]["head"].as_u64().unwrap();
                    runtime.state = IndexState::Ready;
                    runtime.completeness = "ready";
                    runtime.message = None;
                }
                write_response(&stdout, event)?;
            }
        }
        while let Ok(update) = catalog_receiver.try_recv() {
            if let Some(event) = runtime.handle_catalog_update(update) {
                write_response(&stdout, event)?;
                last_catalog_event = Instant::now();
            }
        }
        if runtime.catalog.is_some() && last_catalog_event.elapsed() >= CATALOG_HEARTBEAT_INTERVAL {
            write_response(&stdout, runtime.catalog_progress_event())?;
            last_catalog_event = Instant::now();
        }

        let input = match input_receiver.recv_timeout(Duration::from_millis(10)) {
            Ok(input) => input,
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        };
        let line = match input {
            InputUpdate::Line(line) => line,
            InputUpdate::End => break,
            InputUpdate::Error(message) => return Err(message),
        };
        if line.trim().is_empty() {
            continue;
        }
        let request: Request = match serde_json::from_str(&line) {
            Ok(request) => request,
            Err(error) => {
                write_response(
                    &stdout,
                    json!({
                        "protocol": PROTOCOL_VERSION,
                        "id": null,
                        "ok": false,
                        "error": {"code": "invalid_request", "message": error.to_string()},
                    }),
                )?;
                continue;
            }
        };
        let mut id = json!(request.id);
        if request.protocol == PROTOCOL_VERSION && runtime.uses_readers(&request.method) {
            match runtime.submit_read(request) {
                Ok(()) => continue,
                Err(error) => {
                    if error.code == "duplicate_request_id" {
                        id = Value::Null;
                    }
                    write_response(
                        &stdout,
                        json!({"protocol":PROTOCOL_VERSION,"id":id,"ok":false,"error":{"code":error.code,"message":error.message}}),
                    )?;
                    continue;
                }
            }
        }
        let dispatched = if request.protocol == PROTOCOL_VERSION {
            runtime.dispatch(request, &catalog_sender)
        } else {
            Err(ProtocolError::new(
                "protocol_mismatch",
                format!(
                    "client protocol {} is incompatible with sidecar protocol {PROTOCOL_VERSION}",
                    request.protocol
                ),
            ))
        };
        let (response, shutdown) = match dispatched {
            Ok((result, shutdown)) => (
                json!({
                    "protocol": PROTOCOL_VERSION,
                    "id": id,
                    "ok": true,
                    "result": result,
                }),
                shutdown,
            ),
            Err(error) => (
                json!({
                    "protocol": PROTOCOL_VERSION,
                    "id": id,
                    "ok": false,
                    "error": {"code": error.code, "message": error.message},
                }),
                false,
            ),
        };
        if shutdown && let Some(readers) = runtime.readers.as_mut() {
            for response in readers.poll() {
                write_response(&stdout, response)?;
            }
        }
        write_response(&stdout, response)?;
        if shutdown {
            break 'server;
        }
    }
    if let Some(active) = &runtime.catalog {
        active.control.cancel();
    }
    Ok(())
}
