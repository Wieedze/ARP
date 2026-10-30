export const BY_URL_QUERY = `
query ToolAtomByUrl($url: String!) {
  atoms(where: {value: {thing: {url: {_eq: $url}}}}, limit: 10) {
    term_id
    label
    type
    data
  }
}`;
