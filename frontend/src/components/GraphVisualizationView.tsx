import React, { useEffect, useRef, useState, useMemo } from 'react';
import cytoscape from 'cytoscape';
import type { GraphData } from '../types';
import {
  ZoomIn, ZoomOut, Maximize2, RotateCcw, X, Search,
  Flame, BookOpen, Layers, ExternalLink, MessageSquare,
  ShieldAlert, FileText,
  Compass, Eye, CornerDownRight, SlidersHorizontal
} from 'lucide-react';

interface Props {
  graphData: GraphData | null;
  onFilterChange: (filters: {
    relationTypes: string[];
    nodeTypes: string[];
    minConfidence: number;
    query?: string;
  }) => void;
  onExploreClaim?: (claimId: string) => void;
  onAskLiteratureQA?: (question: string) => void;
}

type GraphLens = 'debate' | 'conflicts' | 'macro' | 'full';

export const GraphVisualizationView: React.FC<Props> = ({
  graphData,
  onFilterChange,
  onExploreClaim,
  onAskLiteratureQA
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  // Graph state & selection
  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<any | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

  // Graph lenses & layout
  const [activeLens, setActiveLens] = useState<GraphLens>('debate');
  const [layoutMode, setLayoutMode] = useState<string>('cose');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [minConfidence, setMinConfidence] = useState<number>(0.0);
  const [showContainment, setShowContainment] = useState<boolean>(false);
  const [canvasTheme, setCanvasTheme] = useState<'light' | 'dark'>('light');

  // Filter toggles & panel
  const [showFilterPanel, setShowFilterPanel] = useState<boolean>(false);
  const [activeRelations, setActiveRelations] = useState<string[]>(['SUPPORTS', 'CONTRADICTS', 'EXTENDS']);
  const [activeNodeTypes, setActiveNodeTypes] = useState<string[]>(['claim', 'paper']);

  const handleConfidenceChange = (val: number) => {
    setMinConfidence(val);
    onFilterChange({ relationTypes: activeRelations, nodeTypes: activeNodeTypes, minConfidence: val, query: searchQuery });
  };

  const handleToggleNodeType = (type: string) => {
    const next = activeNodeTypes.includes(type)
      ? activeNodeTypes.filter(t => t !== type)
      : [...activeNodeTypes, type];
    setActiveNodeTypes(next);
    onFilterChange({ relationTypes: activeRelations, nodeTypes: next, minConfidence, query: searchQuery });
  };

  // Computed summary metrics
  const graphStats = useMemo(() => {
    if (!graphData) return { nodes: 0, edges: 0, supports: 0, contradicts: 0, extends: 0, claims: 0, papers: 0 };
    const claims = graphData.nodes.filter(n => n.type === 'claim').length;
    const papers = graphData.nodes.filter(n => n.type === 'paper').length;
    const supports = graphData.edges.filter(e => e.label === 'SUPPORTS').length;
    const contradicts = graphData.edges.filter(e => e.label === 'CONTRADICTS').length;
    const ext = graphData.edges.filter(e => e.label === 'EXTENDS').length;
    return {
      nodes: graphData.nodes.length,
      edges: graphData.edges.length,
      supports,
      contradicts,
      extends: ext,
      claims,
      papers
    };
  }, [graphData]);

  // Compute node degrees for dynamic sizing
  const nodeDegrees = useMemo(() => {
    const degrees: Record<string, number> = {};
    if (!graphData) return degrees;
    graphData.edges.forEach(e => {
      degrees[e.source] = (degrees[e.source] || 0) + 1;
      degrees[e.target] = (degrees[e.target] || 0) + 1;
    });
    return degrees;
  }, [graphData]);

  // Build Cytoscape elements according to active lens & filters
  const elements = useMemo<cytoscape.ElementDefinition[]>(() => {
    if (!graphData) return [];

    const cyElements: cytoscape.ElementDefinition[] = [];
    const validNodeIds = new Set<string>();

    // 1. Filter Nodes based on Lens
    graphData.nodes.forEach((n) => {
      // In conflict lens, only show claim nodes that participate in CONTRADICTS edges
      if (activeLens === 'conflicts') {
        const hasContradict = graphData.edges.some(
          e => e.label === 'CONTRADICTS' && (e.source === n.id || e.target === n.id)
        );
        if (!hasContradict) return;
      }

      // In macro lens, only show papers and high-level concepts
      if (activeLens === 'macro') {
        if (n.type !== 'paper' && n.type !== 'concept') return;
      }

      // In debate lens, hide containment clutter and focus on claims & papers
      if (activeLens === 'debate') {
        if (!activeNodeTypes.includes(n.type)) return;
      }

      // Search query filtering
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase();
        const matches = (n.label || '').toLowerCase().includes(q) ||
          (n.data?.claim_text || '').toLowerCase().includes(q) ||
          (n.data?.title || '').toLowerCase().includes(q);
        if (!matches && activeLens !== 'conflicts') return;
      }

      validNodeIds.add(n.id);

      // Node styling calculations
      const degree = nodeDegrees[n.id] || 0;
      let bg = '#3b82f6';
      let shape: cytoscape.Css.NodeShape = 'ellipse';
      let size = Math.min(54, Math.max(30, 28 + degree * 2.2));
      let borderColor = '#ffffff';
      let borderWidth = 2.5;

      const claimType = n.data?.claim_type;

      if (n.type === 'paper') {
        bg = canvasTheme === 'dark' ? '#334155' : '#1e293b';
        shape = 'round-rectangle';
        size = 46;
        borderColor = '#94a3b8';
        borderWidth = 2;
      } else if (n.type === 'concept') {
        bg = '#ea580c';
        shape = 'diamond';
        size = 34;
      } else if (claimType === 'finding') {
        bg = '#2563eb'; // Sapphire finding
      } else if (claimType === 'method' || claimType === 'methodology') {
        bg = '#0d9488'; // Emerald Teal method
      } else if (claimType === 'limitation') {
        bg = '#d97706'; // Amber limitation
      } else if (claimType === 'hypothesis') {
        bg = '#7c3aed'; // Violet hypothesis
      }

      // Truncate label for clean readability (max 22 chars)
      let cleanLabel = n.label || '';
      if (n.type === 'paper') {
        const yr = n.data?.year ? `[${n.data.year}] ` : '';
        cleanLabel = yr + (n.data?.title?.slice(0, 20) || 'Paper') + '...';
      } else if (cleanLabel.length > 22) {
        cleanLabel = cleanLabel.slice(0, 20) + '...';
      }

      cyElements.push({
        group: 'nodes',
        data: {
          id: n.id,
          label: cleanLabel,
          fullLabel: n.label,
          type: n.type,
          claimType: claimType || 'general',
          nodeData: n.data,
          degree,
          bg,
          shape,
          size,
          borderColor,
          borderWidth
        }
      });
    });

    // 2. Filter Edges based on Lens & Node Validity
    graphData.edges.forEach((e) => {
      if (!validNodeIds.has(e.source) || !validNodeIds.has(e.target)) return;

      // Filter by confidence
      const conf = e.confidence ?? e.data?.confidence ?? 1.0;
      if (conf < minConfidence) return;

      // Filter by relation toggle
      if (['SUPPORTS', 'CONTRADICTS', 'EXTENDS'].includes(e.label)) {
        if (!activeRelations.includes(e.label)) return;
      }

      // Filter containment lines
      if (e.label === 'CONTAINS_CLAIM') {
        if (activeLens === 'debate' && !showContainment) return;
        if (activeLens === 'conflicts') return;
      }

      // In conflict lens, only show CONTRADICTS
      if (activeLens === 'conflicts' && e.label !== 'CONTRADICTS') {
        return;
      }

      let edgeColor = '#94a3b8';
      let edgeWidth = 2.0;
      let lineStyle: cytoscape.Css.LineStyle = 'solid';
      let opacity = 0.85;

      if (e.label === 'SUPPORTS') {
        edgeColor = '#10b981'; // Emerald
        edgeWidth = 2.4;
      } else if (e.label === 'CONTRADICTS') {
        edgeColor = '#f43f5e'; // High-contrast Crimson Rose
        edgeWidth = 3.6;
        lineStyle = 'dashed';
        opacity = 0.95;
      } else if (e.label === 'EXTENDS') {
        edgeColor = '#8b5cf6'; // Violet
        edgeWidth = 2.4;
      } else if (e.label === 'CITES') {
        edgeColor = '#3b82f6';
        lineStyle = 'dotted';
        edgeWidth = 1.8;
      } else if (e.label === 'CONTAINS_CLAIM') {
        edgeColor = canvasTheme === 'dark' ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.35)';
        edgeWidth = 1.2;
        opacity = 0.4;
      }

      cyElements.push({
        group: 'edges',
        data: {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label,
          confidence: conf,
          edgeColor,
          edgeWidth,
          lineStyle,
          opacity,
          edgeData: e.data
        }
      });
    });

    return cyElements;
  }, [graphData, activeLens, searchQuery, minConfidence, activeRelations, activeNodeTypes, showContainment, canvasTheme, nodeDegrees]);

  // Initialize and mount Cytoscape
  useEffect(() => {
    if (!containerRef.current) return;

    const isDark = canvasTheme === 'dark';

    const cy = cytoscape({
      container: containerRef.current,
      elements: elements,
      boxSelectionEnabled: false,
      style: [
        // ----------------- Base Node Styling -----------------
        {
          selector: 'node',
          style: {
            'background-color': 'data(bg)',
            'label': 'data(label)',
            'color': isDark ? '#f1f5f9' : '#0f172a',
            'font-size': '10.5px',
            'font-family': 'Inter, system-ui, sans-serif',
            'font-weight': 600,
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'text-background-color': isDark ? '#1e293b' : '#ffffff',
            'text-background-opacity': 0.94,
            'text-background-padding': '3px',
            'text-background-shape': 'roundrectangle',
            'text-border-color': isDark ? '#334155' : '#e2e8f0',
            'text-border-width': 1,
            'width': 'data(size)',
            'height': 'data(size)',
            'shape': 'data(shape)' as any,
            'border-width': 'data(borderWidth)',
            'border-color': 'data(borderColor)',
            'transition-property': 'background-color, border-color, border-width, opacity, width, height',
            'transition-duration': 0.22
          }
        },
        // ----------------- Selected Node -----------------
        {
          selector: 'node:selected',
          style: {
            'border-width': 4.5,
            'border-color': isDark ? '#38bdf8' : '#0f172a',
            'underlay-color': 'data(bg)',
            'underlay-padding': 8,
            'underlay-opacity': 0.35
          }
        },
        // ----------------- Focused Neighborhood Highlight -----------------
        {
          selector: 'node.highlighted',
          style: {
            'opacity': 1.0,
            'underlay-color': 'data(bg)',
            'underlay-padding': 6,
            'underlay-opacity': 0.25
          }
        },
        {
          selector: 'node.dimmed',
          style: {
            'opacity': 0.08,
            'text-opacity': 0
          }
        },
        // ----------------- Edge Base Styling -----------------
        {
          selector: 'edge',
          style: {
            'width': 'data(edgeWidth)',
            'line-color': 'data(edgeColor)',
            'target-arrow-color': 'data(edgeColor)',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'line-style': 'data(lineStyle)' as any,
            'opacity': 'data(opacity)' as any,
            'arrow-scale': 1.15,
            'transition-property': 'line-color, width, opacity',
            'transition-duration': 0.2
          }
        },
        // ----------------- Edge Hover / Highlight -----------------
        {
          selector: 'edge:selected, edge.highlighted',
          style: {
            'width': 4.5,
            'opacity': 1.0,
            'label': 'data(label)',
            'font-size': '10px',
            'font-weight': 700,
            'color': isDark ? '#f8fafc' : '#0f172a',
            'text-background-color': isDark ? '#0f172a' : '#ffffff',
            'text-background-opacity': 0.96,
            'text-background-padding': '3px',
            'text-background-shape': 'roundrectangle',
            'text-border-color': 'data(edgeColor)',
            'text-border-width': 1.5,
            'text-rotation': 'autorotate',
            'text-margin-y': -8,
            'z-index': 999
          }
        },
        {
          selector: 'edge.dimmed',
          style: {
            'opacity': 0.04
          }
        }
      ],
      layout: getLayoutConfig(layoutMode),
      wheelSensitivity: 0.25,
      pixelRatio: 'auto',
      textureOnViewport: true,
      hideEdgesOnViewport: true
    });

    // ----------------- Event Handlers -----------------
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const nId = node.id();
      setFocusedNodeId(nId);
      setSelectedEdge(null);

      setSelectedNode({
        id: nId,
        label: node.data('fullLabel') || node.data('label'),
        type: node.data('type'),
        claimType: node.data('claimType'),
        degree: node.data('degree'),
        data: node.data('nodeData')
      });

      // Highlight 1-hop neighborhood & dim the rest
      isolateNeighborhood(cy, node);
    });

    cy.on('tap', 'edge', (evt) => {
      const edge = evt.target;
      setSelectedNode(null);
      setSelectedEdge({
        id: edge.id(),
        label: edge.data('label'),
        source: edge.data('source'),
        target: edge.data('target'),
        confidence: edge.data('confidence'),
        data: edge.data('edgeData')
      });
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        // Clicked canvas background -> clear selection and neighborhood focus
        clearNeighborhood(cy);
        setSelectedNode(null);
        setSelectedEdge(null);
        setFocusedNodeId(null);
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
    };
  }, [elements, layoutMode, canvasTheme]);

  // Isolate node neighborhood
  const isolateNeighborhood = (cy: cytoscape.Core, node: cytoscape.NodeSingular) => {
    const neighborhood = node.neighborhood().add(node);
    cy.elements().difference(neighborhood).removeClass('highlighted').addClass('dimmed');
    neighborhood.removeClass('dimmed').addClass('highlighted');
  };

  // Clear neighborhood isolation
  const clearNeighborhood = (cy: cytoscape.Core) => {
    cy.elements().removeClass('dimmed').removeClass('highlighted');
  };

  const handleResetFocus = () => {
    if (cyRef.current) {
      clearNeighborhood(cyRef.current);
    }
    setFocusedNodeId(null);
    setSelectedNode(null);
    setSelectedEdge(null);
  };

  // Layout configurations helper
  function getLayoutConfig(mode: string): any {
    switch (mode) {
      case 'concentric':
        return {
          name: 'concentric',
          concentric: (node: any) => {
            if (node.data('type') === 'paper') return 10;
            if (node.data('type') === 'claim') return 5;
            return 1;
          },
          levelWidth: () => 2,
          animate: true,
          animationDuration: 500,
          padding: 60
        };
      case 'breadthfirst':
        return {
          name: 'breadthfirst',
          directed: true,
          spacingFactor: 1.25,
          animate: true,
          animationDuration: 500,
          padding: 60
        };
      case 'circle':
        return {
          name: 'circle',
          animate: true,
          animationDuration: 500,
          padding: 60
        };
      case 'cose':
      default:
        return {
          name: 'cose',
          animate: true,
          animationDuration: 600,
          refresh: 20,
          fit: true,
          padding: 50,
          randomize: false,
          componentSpacing: 100,
          nodeRepulsion: 9000,
          nodeOverlap: 20,
          idealEdgeLength: 110,
          edgeElasticity: 100,
          nestingFactor: 1.2,
          gravity: 0.18,
          numIter: 1000,
          initialTemp: 1000,
          coolingFactor: 0.99,
          minTemp: 1.0
        };
    }
  }

  // Smooth camera centering
  const handleFit = () => {
    if (cyRef.current) {
      cyRef.current.animate({ fit: { eles: cyRef.current.elements(':visible'), padding: 50 }, duration: 400 });
    }
  };

  const handleZoom = (factor: number) => {
    if (cyRef.current) {
      const zoom = cyRef.current.zoom();
      cyRef.current.animate({ zoom: zoom * factor, duration: 250 });
    }
  };

  const handleRelayout = () => {
    if (cyRef.current) {
      const layout = cyRef.current.layout(getLayoutConfig(layoutMode));
      layout.run();
    }
  };

  // Lens Switcher
  const handleLensSelect = (lens: GraphLens) => {
    setActiveLens(lens);
    handleResetFocus();
    if (lens === 'conflicts') {
      setActiveRelations(['CONTRADICTS']);
    } else if (lens === 'debate') {
      setActiveRelations(['SUPPORTS', 'CONTRADICTS', 'EXTENDS']);
      setShowContainment(false);
    } else if (lens === 'macro') {
      setActiveRelations(['SUPPORTS', 'CONTRADICTS', 'EXTENDS']);
      setShowContainment(false);
    } else {
      setActiveRelations(['SUPPORTS', 'CONTRADICTS', 'EXTENDS']);
      setShowContainment(true);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: 'calc(100vh - 120px)' }}>
      {/* ----------------- Top Header & Lenses Toolbar ----------------- */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#ffffff',
        padding: '0.85rem 1.25rem',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-xs)',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        {/* Left: View Lenses */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginRight: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600 }}>
            <Compass size={16} /> Graph Lens:
          </div>

          <div style={{ display: 'flex', background: 'var(--bg-subtle)', padding: '3px', borderRadius: 'var(--radius-md)', gap: '2px' }}>
            <button
              type="button"
              onClick={() => handleLensSelect('debate')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0.75rem',
                fontSize: '0.78rem',
                fontWeight: activeLens === 'debate' ? 700 : 500,
                color: activeLens === 'debate' ? '#ffffff' : 'var(--text-secondary)',
                background: activeLens === 'debate' ? 'var(--accent-primary)' : 'transparent',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Claims connected by supporting, contradicting, and extending evidence"
            >
              <Layers size={13} /> Consensus & Debate
            </button>

            <button
              type="button"
              onClick={() => handleLensSelect('conflicts')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0.75rem',
                fontSize: '0.78rem',
                fontWeight: activeLens === 'conflicts' ? 700 : 500,
                color: activeLens === 'conflicts' ? '#ffffff' : '#e11d48',
                background: activeLens === 'conflicts' ? '#e11d48' : 'transparent',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Isolates empirical contradictions and conflicting scientific claims"
            >
              <Flame size={13} /> Conflict Radar ({graphStats.contradicts})
            </button>

            <button
              type="button"
              onClick={() => handleLensSelect('macro')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0.75rem',
                fontSize: '0.78rem',
                fontWeight: activeLens === 'macro' ? 700 : 500,
                color: activeLens === 'macro' ? '#ffffff' : 'var(--text-secondary)',
                background: activeLens === 'macro' ? 'var(--accent-primary)' : 'transparent',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="High-level citation and cross-study network between papers"
            >
              <BookOpen size={13} /> Macro Papers
            </button>

            <button
              type="button"
              onClick={() => handleLensSelect('full')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0.75rem',
                fontSize: '0.78rem',
                fontWeight: activeLens === 'full' ? 700 : 500,
                color: activeLens === 'full' ? '#ffffff' : 'var(--text-secondary)',
                background: activeLens === 'full' ? 'var(--accent-primary)' : 'transparent',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Unified visualization of papers, claims, concepts, and citations"
            >
              <Layers size={13} /> Complete Graph
            </button>
          </div>
        </div>

        {/* Right: Search & Layout Mode */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {/* Quick Search */}
          <div style={{ position: 'relative', width: '220px' }}>
            <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search claims or papers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.35rem 0.65rem 0.35rem 2rem',
                fontSize: '0.78rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-canvas)'
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)'
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Layout Mode Selector */}
          <select
            value={layoutMode}
            onChange={(e) => setLayoutMode(e.target.value)}
            style={{
              padding: '0.35rem 0.65rem',
              fontSize: '0.78rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              background: '#ffffff',
              color: 'var(--text-main)',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <option value="cose">Force Physics (CoSE)</option>
            <option value="concentric">Concentric Orbital</option>
            <option value="breadthfirst">Hierarchical Flow</option>
            <option value="circle">Circular Ring</option>
          </select>

          {/* Canvas Theme Toggle */}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setCanvasTheme(t => t === 'light' ? 'dark' : 'light')}
            title="Toggle Canvas Theme (Light/Dark)"
          >
            {canvasTheme === 'light' ? '🌙 Dark Grid' : '☀️ Light Grid'}
          </button>

          {/* Filters Toggle Button & Popover */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className={`btn btn-secondary btn-sm ${showFilterPanel ? 'active' : ''}`}
              onClick={() => setShowFilterPanel(!showFilterPanel)}
              title="Graph Filters (Confidence, Node Types, Containment)"
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <SlidersHorizontal size={13} /> Filters
            </button>

            {showFilterPanel && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: '240px',
                background: '#ffffff',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-elevated)',
                padding: '1rem',
                zIndex: 40,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem'
              }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                    <span>Min Confidence:</span>
                    <span>{Math.round(minConfidence * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.9"
                    step="0.05"
                    value={minConfidence}
                    onChange={(e) => handleConfidenceChange(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent-indigo)' }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
                    Active Node Types:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {['claim', 'paper', 'concept'].map(nt => (
                      <label key={nt} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.74rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={activeNodeTypes.includes(nt)}
                          onChange={() => handleToggleNodeType(nt)}
                        />
                        <span style={{ textTransform: 'capitalize' }}>{nt}s</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.74rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={showContainment}
                      onChange={(e) => setShowContainment(e.target.checked)}
                    />
                    <span>Show Paper Containment Links</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ----------------- Main Canvas & Floating Panels Container ----------------- */}
      <div style={{
        position: 'relative',
        flex: 1,
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        border: '1px solid var(--border-subtle)',
        background: canvasTheme === 'dark' ? '#090d16' : '#f8fafc',
        backgroundImage: canvasTheme === 'dark'
          ? 'radial-gradient(rgba(148, 163, 184, 0.15) 1.2px, transparent 1.2px)'
          : 'radial-gradient(rgba(148, 163, 184, 0.35) 1.1px, transparent 1.1px)',
        backgroundSize: '24px 24px',
        boxShadow: 'var(--shadow-card)'
      }}>
        {/* Cytoscape DOM Mount */}
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

        {/* ----------------- Neighborhood Focus Floating Pill ----------------- */}
        {focusedNodeId && (
          <div style={{
            position: 'absolute',
            top: '1rem',
            left: '50%',
            transform: 'translateX(-50%)',
            background: canvasTheme === 'dark' ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.94)',
            backdropFilter: 'blur(12px)',
            padding: '0.45rem 1rem',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--border-accent)',
            boxShadow: 'var(--shadow-elevated)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            zIndex: 20
          }}>
            <span style={{ fontSize: '0.78rem', color: canvasTheme === 'dark' ? '#38bdf8' : 'var(--accent-indigo)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Eye size={14} /> Subgraph Neighborhood Isolated
            </span>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              ({selectedNode?.label || 'Selected Node'})
            </span>
            <button
              type="button"
              onClick={handleResetFocus}
              style={{
                background: 'var(--bg-muted)',
                border: 'none',
                borderRadius: 'var(--radius-full)',
                padding: '0.2rem 0.5rem',
                fontSize: '0.72rem',
                fontWeight: 600,
                color: 'var(--text-main)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              <X size={12} /> Clear Focus (Esc)
            </button>
          </div>
        )}

        {/* ----------------- Top-Left Floating Navigation Dock ----------------- */}
        <div style={{
          position: 'absolute',
          top: '1rem',
          left: '1rem',
          background: canvasTheme === 'dark' ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(12px)',
          borderRadius: 'var(--radius-md)',
          padding: '0.5rem',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.35rem',
          zIndex: 10
        }}>
          <button className="btn btn-secondary btn-sm" onClick={() => handleZoom(1.25)} title="Zoom In">
            <ZoomIn size={14} />
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => handleZoom(0.8)} title="Zoom Out">
            <ZoomOut size={14} />
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleFit} title="Fit to Screen">
            <Maximize2 size={14} />
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleRelayout} title="Re-run Layout Physics">
            <RotateCcw size={14} />
          </button>
        </div>

        {/* ----------------- Bottom HUD Bar (Legend & Metrics) ----------------- */}
        <div style={{
          position: 'absolute',
          bottom: '1rem',
          left: '1rem',
          right: selectedNode || selectedEdge ? '370px' : '1rem',
          background: canvasTheme === 'dark' ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(12px)',
          borderRadius: 'var(--radius-md)',
          padding: '0.65rem 1rem',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          zIndex: 10,
          transition: 'right 0.25s ease'
        }}>
          {/* Node Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              Node Legend:
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#2563eb', display: 'inline-block' }} /> Finding
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#0d9488', display: 'inline-block' }} /> Method
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#d97706', display: 'inline-block' }} /> Limitation
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '2px', background: '#1e293b', display: 'inline-block' }} /> Paper
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
              <span style={{ width: '8px', height: '8px', transform: 'rotate(45deg)', background: '#ea580c', display: 'inline-block' }} /> Concept
            </div>
          </div>

          {/* Edge Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              Relations:
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.73rem', color: '#059669', fontWeight: 600 }}>
              <span style={{ width: '14px', height: '2.5px', background: '#10b981', display: 'inline-block' }} /> Supports ({graphStats.supports})
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.73rem', color: '#e11d48', fontWeight: 600 }}>
              <span style={{ width: '14px', height: '2.5px', background: '#f43f5e', borderTop: '2px dashed #f43f5e', display: 'inline-block' }} /> Contradicts ({graphStats.contradicts})
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.73rem', color: '#7c3aed', fontWeight: 600 }}>
              <span style={{ width: '14px', height: '2.5px', background: '#8b5cf6', display: 'inline-block' }} /> Extends ({graphStats.extends})
            </div>
          </div>

          {/* Live Metrics Pill */}
          <div style={{
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            fontWeight: 600,
            background: 'var(--bg-canvas)',
            padding: '0.2rem 0.5rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)'
          }}>
            {elements.filter(e => e.group === 'nodes').length} Active Nodes • {elements.filter(e => e.group === 'edges').length} Relations
          </div>
        </div>

        {/* ----------------- Slide-Over Inspector Drawer (Node Selected) ----------------- */}
        {selectedNode && (
          <div style={{
            position: 'absolute',
            top: '0',
            right: '0',
            bottom: '0',
            width: '350px',
            background: '#ffffff',
            borderLeft: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-modal)',
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            {/* Drawer Header */}
            <div style={{
              padding: '1rem 1.25rem',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              background: 'var(--bg-subtle)'
            }}>
              <div>
                <span className={`badge ${
                  selectedNode.type === 'paper' ? 'badge-primary' :
                  selectedNode.claimType === 'finding' ? 'badge-primary' :
                  selectedNode.claimType === 'method' ? 'badge-success' :
                  selectedNode.claimType === 'limitation' ? 'badge-warning' : 'badge-neutral'
                }`} style={{ textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.04em' }}>
                  {selectedNode.type === 'paper' ? 'Source Academic Paper' :
                   selectedNode.type === 'concept' ? 'Core Scientific Concept' :
                   `${selectedNode.claimType || 'scientific'} claim`}
                </span>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Node Degree: {selectedNode.degree} connections
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Drawer Content */}
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
              {/* Proposition / Title */}
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  {selectedNode.type === 'paper' ? 'Paper Title' : 'Claim Proposition'}
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.45 }}>
                  {selectedNode.type === 'paper' ? selectedNode.data?.title : selectedNode.data?.claim_text}
                </div>
                {selectedNode.data?.normalized_text && selectedNode.data.normalized_text !== selectedNode.data.claim_text && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.4rem', fontStyle: 'italic' }}>
                    Normalized: "{selectedNode.data.normalized_text}"
                  </div>
                )}
              </div>

              {/* Confidence Score Bar (if claim) */}
              {selectedNode.type === 'claim' && selectedNode.data?.confidence !== undefined && (
                <div style={{ background: 'var(--bg-canvas)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: '0.35rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Extraction Confidence</span>
                    <span style={{ fontWeight: 700, color: 'var(--accent-indigo)' }}>
                      {(selectedNode.data.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div style={{ height: '5px', background: 'var(--border-subtle)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${selectedNode.data.confidence * 100}%`,
                      height: '100%',
                      background: 'var(--accent-indigo)',
                      borderRadius: '3px'
                    }} />
                  </div>
                </div>
              )}

              {/* Source Paper Metadata */}
              {selectedNode.type === 'claim' && (
                <div style={{ background: 'var(--bg-canvas)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                    Source Paper
                  </div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    {selectedNode.data?.paper_title || 'Unknown Paper'}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Year: {selectedNode.data?.paper_year || 'N/A'} • Section: {selectedNode.data?.section || 'Full Text'}
                  </div>
                </div>
              )}

              {/* Paper Abstract (if paper) */}
              {selectedNode.type === 'paper' && selectedNode.data?.abstract && (
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                    Abstract Excerpt
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, background: 'var(--bg-canvas)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
                    {selectedNode.data.abstract}
                  </div>
                </div>
              )}

              {/* Concept Info (if concept) */}
              {selectedNode.type === 'concept' && (
                <div style={{ background: 'var(--bg-canvas)', padding: '0.85rem', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                    Domain Category: <strong>{selectedNode.data?.category || 'General'}</strong>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    Relevance Score: <strong>{(selectedNode.data?.confidence * 100 || 85).toFixed(0)}%</strong>
                  </div>
                </div>
              )}

              {/* Interactive Actions */}
              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
                {selectedNode.type === 'claim' && onExploreClaim && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ justifyContent: 'center' }}
                    onClick={() => onExploreClaim(selectedNode.data?.claim_id || selectedNode.id)}
                  >
                    <CornerDownRight size={13} /> View Full Claim Evidence & Citations
                  </button>
                )}

                {selectedNode.type === 'claim' && onAskLiteratureQA && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ justifyContent: 'center' }}
                    onClick={() => onAskLiteratureQA(`What is the empirical evidence supporting or challenging: "${selectedNode.data?.claim_text}"?`)}
                  >
                    <MessageSquare size={13} /> Ask Literature Q&A About Claim
                  </button>
                )}

                {selectedNode.data?.doi && (
                  <a
                    href={selectedNode.data.doi.startsWith('http') ? selectedNode.data.doi : `https://doi.org/${selectedNode.data.doi}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary btn-sm"
                    style={{ justifyContent: 'center', textDecoration: 'none' }}
                  >
                    <ExternalLink size={13} /> View Official DOI Publication
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ----------------- Slide-Over Inspector Drawer (Edge Selected) ----------------- */}
        {selectedEdge && (
          <div style={{
            position: 'absolute',
            top: '0',
            right: '0',
            bottom: '0',
            width: '350px',
            background: '#ffffff',
            borderLeft: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-modal)',
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div style={{
              padding: '1rem 1.25rem',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--bg-subtle)'
            }}>
              <div>
                <span className={`badge ${
                  selectedEdge.label === 'SUPPORTS' ? 'badge-success' :
                  selectedEdge.label === 'CONTRADICTS' ? 'badge-danger' :
                  selectedEdge.label === 'EXTENDS' ? 'badge-primary' : 'badge-neutral'
                }`} style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                  {selectedEdge.label} RELATION
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEdge(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  Semantic Relationship Confidence
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: selectedEdge.label === 'CONTRADICTS' ? '#e11d48' : '#059669' }}>
                  {((selectedEdge.confidence || 0.85) * 100).toFixed(0)}% Corroborated
                </div>
              </div>

              {selectedEdge.data?.reasoning && (
                <div style={{ background: 'var(--bg-canvas)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                    Model Reasoning & Polarity Analysis
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {selectedEdge.data.reasoning}
                  </div>
                </div>
              )}

              {/* Connected Source and Target Papers */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* Source Proposition */}
                <div style={{ background: 'var(--bg-canvas)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                    Source Proposition (From)
                  </div>
                  {selectedEdge.data?.source_claim_text && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', marginBottom: '0.45rem', lineHeight: 1.45, fontWeight: 500 }}>
                      &ldquo;{selectedEdge.data.source_claim_text}&rdquo;
                    </div>
                  )}
                  {selectedEdge.data?.source_paper_title && (
                    <a
                      href={selectedEdge.data.source_paper_doi ? (selectedEdge.data.source_paper_doi.startsWith('http') ? selectedEdge.data.source_paper_doi : `https://doi.org/${selectedEdge.data.source_paper_doi}`) : `https://scholar.google.com/scholar?q=${encodeURIComponent(selectedEdge.data.source_paper_title)}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        color: 'var(--accent-indigo)',
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        textDecoration: 'none'
                      }}
                      title="Open publication in DOI registry or Google Scholar"
                    >
                      <FileText size={12} />
                      <span>Paper: {selectedEdge.data.source_paper_title} {selectedEdge.data.source_paper_year ? `(${selectedEdge.data.source_paper_year})` : ''}</span>
                      <ExternalLink size={10} />
                    </a>
                  )}
                </div>

                {/* Target Proposition */}
                <div style={{ background: 'var(--bg-canvas)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                    Target Proposition (To)
                  </div>
                  {selectedEdge.data?.target_claim_text && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', marginBottom: '0.45rem', lineHeight: 1.45, fontWeight: 500 }}>
                      &ldquo;{selectedEdge.data.target_claim_text}&rdquo;
                    </div>
                  )}
                  {selectedEdge.data?.target_paper_title && (
                    <a
                      href={selectedEdge.data.target_paper_doi ? (selectedEdge.data.target_paper_doi.startsWith('http') ? selectedEdge.data.target_paper_doi : `https://doi.org/${selectedEdge.data.target_paper_doi}`) : `https://scholar.google.com/scholar?q=${encodeURIComponent(selectedEdge.data.target_paper_title)}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        color: 'var(--accent-indigo)',
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        textDecoration: 'none'
                      }}
                      title="Open publication in DOI registry or Google Scholar"
                    >
                      <FileText size={12} />
                      <span>Paper: {selectedEdge.data.target_paper_title} {selectedEdge.data.target_paper_year ? `(${selectedEdge.data.target_paper_year})` : ''}</span>
                      <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              </div>

              {selectedEdge.label === 'CONTRADICTS' && (
                <div style={{
                  background: 'var(--color-contradicts-bg)',
                  border: '1px solid var(--color-contradicts-border)',
                  padding: '0.85rem',
                  borderRadius: 'var(--radius-md)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--color-contradicts-text)', fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.35rem' }}>
                    <ShieldAlert size={15} /> Active Scientific Dispute
                  </div>
                  <p style={{ fontSize: '0.76rem', color: 'var(--color-contradicts-text)', lineHeight: 1.45 }}>
                    These two empirical propositions exhibit opposite polarity or incompatible conclusions across the corpus.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GraphVisualizationView;
