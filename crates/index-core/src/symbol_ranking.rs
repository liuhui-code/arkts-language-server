use crate::{SymbolQuery, WorkspaceSymbol};

pub fn fold_for_search(value: &str) -> String {
    value.to_lowercase()
}

pub fn acronym_for_search(name: &str) -> String {
    name.chars()
        .enumerate()
        .filter_map(|(index, character)| {
            (index == 0 || character.is_uppercase()).then_some(character)
        })
        .collect::<String>()
        .to_lowercase()
}

pub fn rank_symbols(
    query: &SymbolQuery,
    symbols: impl IntoIterator<Item = WorkspaceSymbol>,
) -> Vec<WorkspaceSymbol> {
    let mut matches: Vec<_> = symbols
        .into_iter()
        .filter(|symbol| !query.excludes_uri(&symbol.uri))
        .filter_map(|symbol| query.rank(&symbol.name).map(|rank| (rank, symbol)))
        .collect();
    matches.sort_by(|(left_rank, left), (right_rank, right)| {
        let left_name = fold_for_search(&left.name);
        let right_name = fold_for_search(&right.name);
        left_rank
            .cmp(right_rank)
            .then_with(|| left_name.cmp(&right_name))
            .then_with(|| left.uri.cmp(&right.uri))
            .then_with(|| left.range.start.cmp(&right.range.start))
    });
    matches.truncate(query.limit());
    matches.into_iter().map(|(_, symbol)| symbol).collect()
}

pub(crate) fn symbol_match_rank(name: &str, query: &str) -> Option<u8> {
    if query.is_empty() {
        return None;
    }
    let lowercase_name = fold_for_search(name);
    if lowercase_name == query {
        return Some(0);
    }
    if lowercase_name.starts_with(query) {
        return Some(1);
    }
    let acronym = acronym_for_search(name);
    if acronym.starts_with(query) {
        return Some(2);
    }
    query
        .chars()
        .nth(2)
        .is_some_and(|_| lowercase_name.contains(query))
        .then_some(3)
}
