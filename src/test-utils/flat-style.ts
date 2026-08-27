function flatten(style: unknown): Record<string, unknown> {
  if (style == null || style === false) return {};
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.map(flatten));
  }
  if (typeof style === 'object') {
    return style as Record<string, unknown>;
  }
  return {};
}

export function flatStyle(element: { props: { style?: unknown } }) {
  return flatten(element.props.style);
}
