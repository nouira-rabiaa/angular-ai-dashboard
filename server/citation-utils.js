const CITATION_MARKER_PATTERN = /\[S\d+\]|【S\d+】/g;

export function findCitationLabels(answer) {
  return [...answer.matchAll(CITATION_MARKER_PATTERN)]
    .map(([marker]) => marker.slice(1, -1))
    .filter((label, index, labels) => labels.indexOf(label) === index);
}

export function normalizeValidCitationMarkers(answer, validLabels) {
  const valid = new Set(validLabels);
  return answer.replace(CITATION_MARKER_PATTERN, marker => {
    const label = marker.slice(1, -1);
    return valid.has(label) ? `[${label}]` : marker;
  });
}
