use super::*;
use futures::channel::oneshot;
use gpui::TestAppContext;
use language::rust_lang;
use lsp::FakeLanguageServer;
use parking_lot::Mutex;
use project::FakeFs;
use serde_json::json;
use util::path;

#[derive(Default)]
struct Requests {
    automatic: Vec<(&'static str, lsp::Position)>,
    pending: Vec<oneshot::Sender<()>>,
    manual_armed: bool,
    manual_seen: bool,
}

#[gpui::test]
async fn background_context_bounds_admission_preserves_all_results_and_manual_navigation(
    cx: &mut TestAppContext,
) {
    let (project, buffer, server, _document_lsp) = fixture(cx).await;
    let requests = Arc::new(Mutex::new(Requests::default()));
    handlers(&server, requests.clone());
    let store = refresh(&project, &buffer, cx);
    assert_eq!(requests.lock().automatic.len(), 2,
        "background context must admit one identifier pair, not all 32 pairs eagerly");

    requests.lock().manual_armed = true;
    let manual = project.update(cx, |project, cx| project.definitions(&buffer, 4usize, cx));
    cx.run_until_parked();
    assert!(requests.lock().manual_seen, "manual navigation must reach the server while the automatic pair is pending");
    assert_eq!(requests.lock().automatic.len(), 2, "later speculative positions must remain unissued");
    assert!(manual.await.expect("manual request").expect("capable server").is_empty());
    requests.lock().manual_armed = false;

    for _ in 0..32 {
        let pending = std::mem::take(&mut requests.lock().pending);
        assert!(!pending.is_empty() && pending.len() <= 2);
        for response in pending { response.send(()).expect("one response per live request"); }
        cx.run_until_parked();
    }
    let actual = requests.lock().automatic.clone();
    assert_eq!(actual.len(), 64, "backpressure must not truncate identifiers or omit type definitions");
    let distinct: std::collections::BTreeSet<_> = actual.iter()
        .map(|(method, position)| (*method, position.line, position.character)).collect();
    assert_eq!(distinct.len(), 64);
    assert!(requests.lock().pending.is_empty());
    assert!(store.update(cx, |store, cx| store.related_files(cx)).is_empty(), "the server returned no locations");

    let position = buffer.read_with(cx, |buffer, _| buffer.anchor_before(buffer.len() - 3));
    store.update(cx, |store, cx| store.refresh(buffer.clone(), position, cx));
    cx.executor().advance_clock(DEBOUNCE_DURATION);
    cx.run_until_parked();
    assert_eq!(requests.lock().automatic.len(), 64, "unchanged warm context retains every cache hit");
}

#[gpui::test]
async fn disposing_context_does_not_create_the_rest_of_its_speculative_requests(
    cx: &mut TestAppContext,
) {
    let (project, buffer, server, _document_lsp) = fixture(cx).await;
    let requests = Arc::new(Mutex::new(Requests::default()));
    handlers(&server, requests.clone());
    let store = refresh(&project, &buffer, cx);
    assert_eq!(requests.lock().automatic.len(), 2);
    drop(store);
    for response in std::mem::take(&mut requests.lock().pending) {
        response.send(()).expect("finish the already admitted request");
    }
    cx.run_until_parked();
    assert_eq!(requests.lock().automatic.len(), 2, "a dead context cannot issue its remaining identifiers");
    assert!(requests.lock().pending.is_empty());
}

fn refresh(project: &Entity<Project>, buffer: &Entity<Buffer>, cx: &mut TestAppContext) -> Entity<RelatedExcerptStore> {
    let store = cx.new(|cx| RelatedExcerptStore::new(project, cx));
    let position = buffer.read_with(cx, |buffer, _| buffer.anchor_before(buffer.len() - 3));
    store.update(cx, |store, cx| { store.set_identifier_line_count(0); store.refresh(buffer.clone(), position, cx); });
    cx.executor().advance_clock(DEBOUNCE_DURATION);
    cx.run_until_parked();
    store
}

fn handlers(server: &FakeLanguageServer, requests: Arc<Mutex<Requests>>) {
    server.set_request_handler::<lsp::request::GotoDefinition, _, _>({
        let requests = requests.clone();
        move |params, _| {
            let release = admitted(&requests, "definition", params.text_document_position_params.position);
            async move { if let Some(release) = release { release.await?; } Ok(None) }
        }
    });
    server.set_request_handler::<lsp::request::GotoTypeDefinition, _, _>(move |params, _| {
        let release = admitted(&requests, "typeDefinition", params.text_document_position_params.position);
        async move { if let Some(release) = release { release.await?; } Ok(None) }
    });
}

fn admitted(requests: &Mutex<Requests>, method: &'static str, position: lsp::Position) -> Option<oneshot::Receiver<()>> {
    let mut requests = requests.lock();
    if requests.manual_armed && method == "definition" && position == lsp::Position::new(0, 4) {
        requests.manual_seen = true;
        return None;
    }
    let (release, waiting) = oneshot::channel();
    requests.automatic.push((method, position));
    requests.pending.push(release);
    Some(waiting)
}

async fn fixture(cx: &mut TestAppContext) -> (Entity<Project>, Entity<Buffer>, FakeLanguageServer, Box<dyn std::any::Any>) {
    let settings = cx.update(|cx| settings::SettingsStore::test(cx));
    cx.set_global(settings);
    let fs = FakeFs::new(cx.executor());
    let arguments = (0..40).map(|index| format!("name{index:02}")).collect::<Vec<_>>().join(", ");
    fs.insert_tree(path!("/root"), json!({ "main.rs": format!("fn inspect() {{ choose({arguments}); }}") })).await;
    let project = Project::test(fs, [path!("/root").as_ref()], cx).await;
    let (registry, fs) = project.read_with(cx, |project, _| (project.languages().clone(), project.fs().clone()));
    let language = rust_lang();
    registry.add(language.clone());
    let mut servers = fake_definition_lsp::register_fake_definition_server(&registry, language, fs);
    let (buffer, handle) = project.update(cx, |project, cx| project.open_local_buffer_with_lsp(path!("/root/main.rs"), cx))
        .await.expect("open synchronized buffer");
    let server = servers.next().await.expect("real project language-server connection");
    cx.run_until_parked();
    (project, buffer, server, Box::new(handle))
}
