"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type IsValidConnection,
  type NodeChange,
} from "@xyflow/react";
import { useTranslations } from "next-intl";
import type { FlowDocument, Problem } from "@/modules/flow";
import { BrickNode } from "./brick-node";
import { toGraph, type BrickEdge, type BrickNode as BrickNodeType, type Mark } from "./graph";

/**
 * The canvas: draws the document and nothing else (docs/adr/0011).
 * Bricks cannot be dragged into places — layout is computed — but a
 * connection can be drawn from an output to an input, a brick or an
 * edge can be selected and deleted, and the whole thing is reachable
 * with a keyboard. Every change goes up as an intent; the editor
 * turns it into a patch.
 */

export type CanvasProps = {
  document: FlowDocument;
  problems: Problem[];
  marks?: Map<string, Mark>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onConnect: (connection: {
    source: string;
    sourceHandle: string;
    target: string;
    targetHandle: string;
  }) => void;
  onDelete: (ids: { nodes: string[]; edges: string[] }) => void;
  isValidConnection: (connection: Connection) => boolean;
  readOnly?: boolean;
};

const nodeTypes = { brick: BrickNode };

function Canvas(props: CanvasProps) {
  const t = useTranslations("canvas");
  const { document, problems, marks, selectedId, onSelect, onConnect, onDelete, readOnly } = props;
  const graph = useMemo(() => toGraph(document, problems, marks), [document, problems, marks]);
  const [nodes, setNodes, onNodesChange] = useNodesState<BrickNodeType>(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<BrickEdge>(graph.edges);
  const { fitView } = useReactFlow();

  // A new version arrives as a new graph; selection is the editor's and is
  // laid over it at render, so a change of either never chases the other.
  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph, setNodes, setEdges]);
  const shownNodes = useMemo(
    () =>
      nodes.map((n) =>
        n.selected === (n.id === selectedId) ? n : { ...n, selected: n.id === selectedId },
      ),
    [nodes, selectedId],
  );
  const shownEdges = useMemo(
    () =>
      edges.map((e) =>
        e.selected === (e.id === selectedId) ? e : { ...e, selected: e.id === selectedId },
      ),
    [edges, selectedId],
  );

  // Refit when the picture changes size: a brick added, the panel opened.
  const panelOpen = selectedId !== null;
  useEffect(() => {
    const frame = requestAnimationFrame(() => fitView({ padding: 0.15, duration: 200 }));
    return () => cancelAnimationFrame(frame);
  }, [document.nodes.length, panelOpen, fitView]);

  /** A click or a keyboard pick arrives as a select change; the editor is told, and decides. */
  const pickFrom = useCallback(
    (changes: Array<NodeChange<BrickNodeType> | EdgeChange<BrickEdge>>) => {
      const picked = changes.find((c) => c.type === "select" && c.selected);
      if (picked && picked.type === "select") {
        if (picked.id !== selectedId) onSelect(picked.id);
        return;
      }
      const dropped = changes.find(
        (c) => c.type === "select" && !c.selected && c.id === selectedId,
      );
      if (dropped) onSelect(null);
    },
    [onSelect, selectedId],
  );
  const handleNodesChange = useCallback(
    (changes: NodeChange<BrickNodeType>[]) => {
      onNodesChange(changes);
      pickFrom(changes);
    },
    [onNodesChange, pickFrom],
  );
  const handleEdgesChange = useCallback(
    (changes: EdgeChange<BrickEdge>[]) => {
      onEdgesChange(changes);
      pickFrom(changes);
    },
    [onEdgesChange, pickFrom],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.sourceHandle || !connection.targetHandle) return;
      onConnect({
        source: connection.source,
        sourceHandle: connection.sourceHandle,
        target: connection.target,
        targetHandle: connection.targetHandle,
      });
    },
    [onConnect],
  );

  const isValid: IsValidConnection<BrickEdge> = useCallback(
    (connection) =>
      props.isValidConnection({
        source: connection.source,
        sourceHandle: connection.sourceHandle ?? null,
        target: connection.target,
        targetHandle: connection.targetHandle ?? null,
      }),
    [props],
  );

  return (
    <ReactFlow<BrickNodeType, BrickEdge>
      nodes={shownNodes}
      edges={shownEdges}
      nodeTypes={nodeTypes}
      onNodesChange={handleNodesChange}
      onEdgesChange={handleEdgesChange}
      onPaneClick={() => onSelect(null)}
      onConnect={handleConnect}
      isValidConnection={isValid}
      onDelete={({ nodes: gone, edges: goneEdges }) =>
        onDelete({ nodes: gone.map((n) => n.id), edges: goneEdges.map((e) => e.id) })
      }
      deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
      nodesConnectable={!readOnly}
      elementsSelectable
      nodesFocusable
      edgesFocusable
      // Layout is the document's; a drag reorders nothing yet, so it is off.
      nodesDraggable={false}
      panOnScroll
      zoomOnDoubleClick={false}
      minZoom={0.3}
      maxZoom={1.6}
      proOptions={{ hideAttribution: true }}
      defaultEdgeOptions={{ type: "default", style: { strokeWidth: 1.5 } }}
      aria-label={t("label")}
      className="bg-background"
    >
      <Background gap={24} size={1} color="var(--hairline)" />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  );
}

export function FlowCanvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
