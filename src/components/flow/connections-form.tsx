"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { inputPorts, PortIndex, type FlowDocument, type FlowNode } from "@/modules/flow";
import { candidateSources } from "./patches";

/**
 * The connections of a brick, as a select per input port: the way to
 * wire a flow without a drag (CLAUDE.md, product principles). Only what
 * fits is offered — the same validation as the drawn connection — and
 * a reference port, which names its own source, is shown as it is.
 */
export function ConnectionsForm({
  doc,
  node,
  onReconnect,
}: {
  doc: FlowDocument;
  node: FlowNode;
  onReconnect: (port: string, from: { node: string; port: string } | null) => void;
}) {
  const t = useTranslations("flow.panel.connections");
  const ports = inputPorts(node);
  const index = new PortIndex(doc);
  if (ports.length === 0) return null;
  const visible =
    node.type === "combine"
      ? ports.filter(
          (p, i) => index.edgeInto(node.id, p.name) || i <= connectedCount(ports, index, node.id),
        )
      : ports;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">{t("title")}</p>
      {visible.map((port) => (
        <PortSelect
          key={port.name}
          doc={doc}
          nodeId={node.id}
          port={port.name}
          current={index.edgeInto(node.id, port.name)?.from ?? null}
          onReconnect={(from) => onReconnect(port.name, from)}
        />
      ))}
    </div>
  );
}

function connectedCount(ports: ReturnType<typeof inputPorts>, index: PortIndex, nodeId: string) {
  return ports.filter((p) => index.edgeInto(nodeId, p.name)).length + 1;
}

function PortSelect({
  doc,
  nodeId,
  port,
  current,
  onReconnect,
}: {
  doc: FlowDocument;
  nodeId: string;
  port: string;
  current: { node: string; port: string } | null;
  onReconnect: (from: { node: string; port: string } | null) => void;
}) {
  const t = useTranslations("flow.panel.connections");
  const id = useId();
  const candidates = candidateSources(doc, nodeId, port);
  const value = current ? `${current.node}.${current.port}` : "";
  const titleOf = (nodeId: string) => doc.nodes.find((n) => n.id === nodeId)?.title ?? nodeId;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{port}</Label>
      <NativeSelect
        id={id}
        variant="sm"
        value={value}
        onChange={(e) => {
          const picked = candidates.find((c) => `${c.node}.${c.port}` === e.target.value);
          onReconnect(picked ? { node: picked.node, port: picked.port } : null);
        }}
      >
        <option value="">{t("none")}</option>
        {current && !candidates.some((c) => `${c.node}.${c.port}` === value) ? (
          <option value={value}>
            {titleOf(current.node)} · {current.port}
          </option>
        ) : null}
        {candidates.map((c) => (
          <option key={`${c.node}.${c.port}`} value={`${c.node}.${c.port}`}>
            {c.title} · {c.port}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
