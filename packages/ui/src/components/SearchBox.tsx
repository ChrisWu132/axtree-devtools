import { useState, useEffect, useCallback } from 'react';
import type { AXNodeTree, AXNodeFlat } from '@ax/core';

interface SearchBoxProps {
  tree: AXNodeTree | null;
  onSearchResults: (results: AXNodeFlat[]) => void;
  onClearSearch: () => void;
}

interface SearchResult {
  node: AXNodeFlat;
  path: string;
  matchType: 'name' | 'role' | 'value';
  excerpt: string;
}

export function SearchBox({ tree, onSearchResults, onClearSearch }: SearchBoxProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const searchInTree = (node: AXNodeTree, term: string, path: string = ''): SearchResult[] => {
    const results: SearchResult[] = [];
    const lowerTerm = term.toLowerCase();
    
    // Current node path
    const currentPath = path ? `${path} > ${node.role}` : node.role;
    
    // Convert node to flat format for results
    const flatNode: AXNodeFlat = {
      backendNodeId: node.backendNodeId,
      role: node.role,
      name: node.name,
      value: node.value,
      properties: node.properties,
      boundingBox: node.boundingBox,
      attributes: node.attributes,
      states: node.states
    };

    // Check if current node matches
    if (node.name && node.name.toLowerCase().includes(lowerTerm)) {
      results.push({
        node: flatNode,
        path: currentPath,
        matchType: 'name',
        excerpt: node.name
      });
    }

    if (node.role && node.role.toLowerCase().includes(lowerTerm)) {
      results.push({
        node: flatNode,
        path: currentPath,
        matchType: 'role',
        excerpt: node.role
      });
    }

    if (node.value && node.value.toLowerCase().includes(lowerTerm)) {
      results.push({
        node: flatNode,
        path: currentPath,
        matchType: 'value',
        excerpt: node.value
      });
    }

    // Search in children
    if (node.children) {
      for (const child of node.children) {
        results.push(...searchInTree(child, term, currentPath));
      }
    }

    return results;
  };

  const handleSearch = useCallback((term: string) => {
    if (!term.trim()) {
      onClearSearch();
      return;
    }

    if (!tree) {
      onSearchResults([]);
      return;
    }

    setIsSearching(true);
    
    // Debounce search to avoid too many updates
    setTimeout(() => {
      const results = searchInTree(tree, term);
      onSearchResults(results.slice(0, 50).map(r => r.node)); // Limit to 50 results and extract nodes
      setIsSearching(false);
    }, 300);
  }, [tree, onSearchResults, onClearSearch]);

  useEffect(() => {
    handleSearch(searchTerm);
  }, [searchTerm, tree, handleSearch]);

  const handleClear = () => {
    setSearchTerm('');
    onClearSearch();
  };

  return (
    <div className="search-box">
      <div className="search-input-container">
        <input
          type="text"
          placeholder="Search nodes by name, role, or value..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        {searchTerm && (
          <button 
            onClick={handleClear}
            className="search-clear"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
        {isSearching && (
          <div className="search-loading">⏳</div>
        )}
      </div>
    </div>
  );
}