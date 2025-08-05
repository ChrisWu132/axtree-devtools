import { useState } from 'react';

interface NodeDetailsProps {
  selectedNode: any;
}

export function NodeDetails({ selectedNode }: NodeDetailsProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (!selectedNode) {
    return (
      <div>
        <h3>Node Details</h3>
        <p className="no-selection">Select a node to view details</p>
      </div>
    );
  }

  const nodeData = selectedNode.data;
  const hasAdvancedData = nodeData?.states?.length > 0 || 
                         nodeData?.attributes && Object.keys(nodeData.attributes).length > 0 ||
                         nodeData?.properties && Object.keys(nodeData.properties).length > 0;

  return (
    <div>
      <h3>Node Details</h3>
      
      {/* Basic Information */}
      <div className="node-details">
        <div className="detail-item">
          <label>Role:</label>
          <span className="role-badge">{nodeData?.role || 'Unknown'}</span>
        </div>
        <div className="detail-item">
          <label>Name:</label>
          <span>{nodeData?.name || 'No name'}</span>
        </div>
        <div className="detail-item">
          <label>Value:</label>
          <span>{nodeData?.value || 'No value'}</span>
        </div>
        <div className="detail-item">
          <label>Backend Node ID:</label>
          <span>{nodeData?.backendNodeId || 'Unknown'}</span>
        </div>

        {/* Advanced Details Toggle */}
        {hasAdvancedData && (
          <div className="detail-item">
            <button 
              className="toggle-advanced"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? '▼' : '▶'} Advanced Details
            </button>
          </div>
        )}

        {/* Advanced Information (Collapsible) */}
        {showAdvanced && hasAdvancedData && (
          <div className="advanced-details">
            
            {/* States */}
            {nodeData?.states && nodeData.states.length > 0 && (
              <div className="detail-section">
                <h4>States</h4>
                <div className="tag-list">
                  {nodeData.states.map((state: string, index: number) => (
                    <span key={index} className="state-tag">{state}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Attributes */}
            {nodeData?.attributes && Object.keys(nodeData.attributes).length > 0 && (
              <div className="detail-section">
                <h4>Attributes</h4>
                <div className="attribute-list">
                  {Object.entries(nodeData.attributes).map(([key, value]) => (
                    <div key={key} className="attribute-item">
                      <span className="attr-key">{key}:</span>
                      <span className="attr-value">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Properties */}
            {nodeData?.properties && Object.keys(nodeData.properties).length > 0 && (
              <div className="detail-section">
                <h4>Properties</h4>
                <div className="property-list">
                  {Object.entries(nodeData.properties).map(([key, value]) => (
                    <div key={key} className="property-item">
                      <span className="prop-key">{key}:</span>
                      <span className="prop-value">
                        {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bounding Box */}
            {nodeData?.boundingBox && (
              <div className="detail-section">
                <h4>Bounding Box</h4>
                <div className="bbox-info">
                  <span>x: {nodeData.boundingBox.x}</span>
                  <span>y: {nodeData.boundingBox.y}</span>
                  <span>width: {nodeData.boundingBox.width}</span>
                  <span>height: {nodeData.boundingBox.height}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}