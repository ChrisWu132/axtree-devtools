import { useState } from 'react';
import { TreeView } from './components/TreeView';
import { NodeDetails } from './components/NodeDetails';
import { SearchBox } from './components/SearchBox';
import { SearchResults } from './components/SearchResults';
import { useAxTreeSocket } from './hooks/useAxTreeSocket';
import './App.css';

function App() {
  const { tree, isConnected, error, sendHighlight } = useAxTreeSocket();
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);

  const handleNodeSelect = (node: any) => {
    setSelectedNode(node);
    console.log('Selected node:', node);
  };

  const handleNodeHighlight = (backendNodeId: number) => {
    sendHighlight(backendNodeId);
    console.log('Highlighting node:', backendNodeId);
  };

  const handleSearchResults = (results: any[]) => {
    setSearchResults(results);
    setShowSearchResults(results.length > 0);
  };

  const handleClearSearch = () => {
    setSearchResults([]);
    setShowSearchResults(false);
  };

  const handleSearchResultClick = (node: any) => {
    // Convert search result node to tree view format
    const treeNode = {
      data: node
    };
    setSelectedNode(treeNode);
    handleNodeHighlight(node.backendNodeId);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>AXTree Tool</h1>
        <div className="connection-status">
          <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </div>
          {error && (
            <div className="error-message">
              ⚠️ {error}
            </div>
          )}
        </div>
      </header>

      <div className="search-section">
        <SearchBox 
          tree={tree}
          onSearchResults={handleSearchResults}
          onClearSearch={handleClearSearch}
        />
      </div>

      <main className="app-main">
        <div className="tree-panel">
          <TreeView 
            data={tree}
            onNodeSelect={handleNodeSelect}
            onNodeHighlight={handleNodeHighlight}
          />
          {showSearchResults && (
            <SearchResults
              results={searchResults}
              onResultClick={handleSearchResultClick}
            />
          )}
        </div>
        
        <div className="details-panel">
          <NodeDetails selectedNode={selectedNode} />
        </div>
      </main>
    </div>
  );
}

export default App;