interface SearchResult {
  node: any;
  path: string;
  matchType: 'name' | 'role' | 'value';
  excerpt: string;
}

interface SearchResultsProps {
  results: SearchResult[];
  onResultClick: (node: any) => void;
}

export function SearchResults({ results, onResultClick }: SearchResultsProps) {
  if (results.length === 0) {
    return null;
  }

  return (
    <div className="search-results">
      <div className="search-results-header">
        <h4>Search Results ({results.length})</h4>
      </div>
      <div className="search-results-list">
        {results.map((result, index) => (
          <div
            key={`${result.node.backendNodeId}-${index}`}
            className="search-result-item"
            onClick={() => onResultClick(result.node)}
          >
            <div className="search-result-match">
              <span className={`match-type match-type-${result.matchType}`}>
                {result.matchType}
              </span>
              <span className="match-excerpt">"{result.excerpt}"</span>
            </div>
            <div className="search-result-path">
              {result.path}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}