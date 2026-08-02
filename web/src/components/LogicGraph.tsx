import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";

interface Question {
  id: string;
  sort_order: number;
  type: string;
  title: string;
  options: string[];
  skip_logic?: any[];
  show_logic?: any[];
}

interface LogicGraphProps {
  questions: Question[];
  onQuestionClick?: (id: string) => void;
}

const NODE_W = 240;
const NODE_H = 72;
const GAP_Y = 110;
const PAD_X = 60;
const PAD_Y = 50;
const CANVAS_W = 700;

const TYPE_ICONS: Record<string, string> = {
  single: "?",
  multiple: "?",
  text: "?",
  scale: "?",
};

const TYPE_LABELS: Record<string, string> = {
  single: "单选",
  multiple: "多选",
  text: "填空",
  scale: "量表",
};

export default function LogicGraph({ questions, onQuestionClick }: LogicGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // Build connections
  const connections = useMemo(() => {
    const conns: { from: string; to: string; label: string; type: "skip" | "show" | "normal" }[] = [];
    questions.forEach((q, idx) => {
      if (idx < questions.length - 1) {
        conns.push({ from: q.id, to: questions[idx + 1].id, label: "", type: "normal" });
      }
      q.skip_logic?.forEach((logic: any) => {
        const target = logic.action === "end" ? "__END__" : logic.target_question_id;
        if (target) {
          const label = logic.condition_value ? `${logic.condition || "等于"}: ${logic.condition_value}` : "跳转";
          conns.push({ from: q.id, to: target, label, type: "skip" });
        }
      });
      q.show_logic?.forEach((logic: any) => {
        if (logic.target_question_id) {
          conns.push({ from: q.id, to: logic.target_question_id, label: "显示条件", type: "show" });
        }
      });
    });
    return conns;
  }, [questions]);

  // Node positions
  const nodePositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    questions.forEach((q, idx) => {
      positions[q.id] = { x: PAD_X, y: PAD_Y + idx * (NODE_H + GAP_Y) };
    });
    positions["__END__"] = { x: PAD_X, y: PAD_Y + questions.length * (NODE_H + GAP_Y) };
    return positions;
  }, [questions]);

  const totalH = PAD_Y * 2 + questions.length * (NODE_H + GAP_Y) + NODE_H;

  // Search matching
  const matchingIds = useMemo(() => {
    if (!searchTerm.trim()) return new Set<string>();
    const term = searchTerm.toLowerCase();
    return new Set(
      questions
        .filter((q) => q.title.toLowerCase().includes(term) || String(q.sort_order).includes(term))
        .map((q) => q.id)
    );
  }, [searchTerm, questions]);

  const scrollQuestionIntoView = useCallback(
    (id: string) => {
      onQuestionClick?.(id);
      setHighlightedId(id);
      setTimeout(() => setHighlightedId(null), 2000);
    },
    [onQuestionClick]
  );

  // Zoom via scroll wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(3, Math.max(0.2, z - e.deltaY * 0.001)));
  }, []);

  // Pan handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, px: panX, py: panY };
    },
    [panX, panY]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return;
      setPanX(panStart.current.px + (e.clientX - panStart.current.x));
      setPanY(panStart.current.py + (e.clientY - panStart.current.y));
    },
    [isPanning]
  );

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const prevent = (e: WheelEvent) => { if (el.contains(e.target as Node)) e.preventDefault(); };
    el.addEventListener("wheel", prevent, { passive: false });
    return () => el.removeEventListener("wheel", prevent);
  }, []);

  // Arrow marker defs
  const renderArrowMarkers = () => (
    <defs>
      <marker id="arrow-normal" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
      </marker>
      <marker id="arrow-skip" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#dc2626" />
      </marker>
      <marker id="arrow-show" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
      </marker>
      <filter id="node-shadow" x="-10%" y="-10%" width="120%" height="130%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.12" />
      </filter>
      <filter id="glow-highlight" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#f59e0b" floodOpacity="0.7" />
      </filter>
    </defs>
  );

  const renderConnections = () =>
    connections.map((conn, idx) => {
      const from = nodePositions[conn.from];
      const to = nodePositions[conn.to];
      if (!from || !to) return null;

      const x1 = from.x + NODE_W / 2;
      const y1 = from.y + NODE_H;
      const x2 = to.x + NODE_W / 2;
      const y2 = to.y;

      const color = conn.type === "normal" ? "#9ca3af" : conn.type === "skip" ? "#dc2626" : "#3b82f6";
      const dash = conn.type === "normal" ? "none" : conn.type === "skip" ? "8,4" : "4,4";
      const markerId = `arrow-${conn.type}`;

      // Curved path
      const midY = (y1 + y2) / 2;
      const d = `M ${x1} ${y1} C ${x1} ${midY} ${x2} ${midY} ${x2} ${y2}`;

      // Label position (offset to the right for readability)
      const labelX = (x1 + x2) / 2 + 16;
      const labelY = midY - 4;

      return (
        <g key={idx}>
          <path
            d={d}
            stroke={color}
            strokeWidth={conn.type === "normal" ? 1.5 : 2}
            fill="none"
            strokeDasharray={dash}
            markerEnd={`url(#${markerId})`}
            opacity={0.85}
          />
          {conn.label && (
            <g>
              <rect
                x={labelX - 2}
                y={labelY - 10}
                width={conn.label.length * 7 + 8}
                height={16}
                rx={3}
                fill="#fff"
                stroke={color}
                strokeWidth={0.5}
                opacity={0.9}
              />
              <text x={labelX + 2} y={labelY + 2} fill={color} fontSize={10} fontWeight={500}>
                {conn.label}
              </text>
            </g>
          )}
        </g>
      );
    });

  const renderNodes = () =>
    questions.map((q, idx) => {
      const pos = nodePositions[q.id];
      const hasLogic = (q.skip_logic && q.skip_logic.length > 0) || (q.show_logic && q.show_logic.length > 0);
      const isSearchMatch = matchingIds.has(q.id);
      const isHighlighted = highlightedId === q.id;
      const icon = TYPE_ICONS[q.type] || "?";
      const typeLabel = TYPE_LABELS[q.type] || q.type;

      let fill = "#f9fafb";
      let stroke = "#d1d5db";
      let strokeW = 1.5;
      let filterAttr = "url(#node-shadow)";

      if (isHighlighted) {
        fill = "#fef3c7";
        stroke = "#f59e0b";
        strokeW = 3;
        filterAttr = "url(#glow-highlight)";
      } else if (isSearchMatch) {
        fill = "#eff6ff";
        stroke = "#3b82f6";
        strokeW = 2.5;
      } else if (hasLogic) {
        fill = "#fffbeb";
        stroke = "#d97706";
        strokeW = 2;
      }

      return (
        <g
          key={q.id}
          onClick={() => scrollQuestionIntoView(q.id)}
          style={{ cursor: "pointer" }}
          filter={filterAttr}
        >
          <rect
            x={pos.x}
            y={pos.y}
            width={NODE_W}
            height={NODE_H}
            rx={10}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeW}
          />
          {/* Type badge */}
          <rect x={pos.x + 8} y={pos.y + 8} width={42} height={20} rx={4} fill="#e0e7ff" />
          <text x={pos.x + 14} y={pos.y + 22} fill="#4f46e5" fontSize={10} fontWeight={600}>
            {icon} {typeLabel}
          </text>
          {/* Question number */}
          <text x={pos.x + 56} y={pos.y + 22} fill="#4f46e5" fontSize={12} fontWeight={700}>
            Q{q.sort_order}
          </text>
          {/* Title */}
          <text x={pos.x + 10} y={pos.y + 48} fill="#1f2937" fontSize={12}>
            {q.title.length > 24 ? q.title.substring(0, 24) + "…" : q.title}
          </text>
          {/* Logic badge */}
          {hasLogic && (
            <g>
              <circle cx={pos.x + NODE_W - 16} cy={pos.y + 16} r={10} fill="#d97706" />
              <text x={pos.x + NODE_W - 16} y={pos.y + 20} fill="#fff" fontSize={9} fontWeight={700} textAnchor="middle">
                L
              </text>
            </g>
          )}
          {/* Search match indicator */}
          {isSearchMatch && !isHighlighted && (
            <circle cx={pos.x + NODE_W - 16} cy={pos.y + NODE_H - 16} r={6} fill="#3b82f6">
              <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite" />
            </circle>
          )}
        </g>
      );
    });

  const renderEndNode = () => {
    const pos = nodePositions["__END__"];
    return (
      <g>
        <rect x={pos.x} y={pos.y} width={NODE_W} height={NODE_H} rx={NODE_H / 2} fill="#dc2626" stroke="#b91c1c" strokeWidth={2} filter="url(#node-shadow)" />
        <text x={pos.x + NODE_W / 2} y={pos.y + NODE_H / 2 + 6} fill="#fff" fontSize={16} fontWeight={700} textAnchor="middle">
          结束
        </text>
      </g>
    );
  };

  return (
    <div ref={containerRef} style={{ background: "#fff", borderRadius: 12, padding: 0, overflow: "hidden", border: "1px solid #e5e7eb" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid #f0f0f0", background: "#fafafa" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "#1f2937" }}>?? 逻辑流程图</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Search */}
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜索题目…"
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, width: 160 }}
          />
          {/* Zoom controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#f3f4f6", borderRadius: 6, padding: "2px 4px" }}>
            <button onClick={() => setZoom((z) => Math.max(0.2, z - 0.15))} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18, padding: "2px 8px", color: "#374151" }}>?</button>
            <span style={{ fontSize: 12, color: "#6b7280", minWidth: 44, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(3, z + 0.15))} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18, padding: "2px 8px", color: "#374151" }}>+</button>
            <button onClick={() => { setZoom(1); setPanX(0); setPanY(0); }} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 11, padding: "2px 6px", color: "#6b7280" }}>重置</button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 20, padding: "8px 20px", borderBottom: "1px solid #f0f0f0", fontSize: 12, color: "#6b7280", background: "#fafafa" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 24, height: 2, background: "#9ca3af" }} />
          <span>正常流程</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 24, height: 2, background: "#dc2626", borderTop: "2px dashed #dc2626" }} />
          <span>跳转逻辑</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 24, height: 2, background: "#3b82f6", borderTop: "2px dotted #3b82f6" }} />
          <span>显示逻辑</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: "#fffbeb", border: "2px solid #d97706" }} />
          <span>含逻辑规则</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: "#eff6ff", border: "2px solid #3b82f6" }} />
          <span>搜索匹配</span>
        </div>
      </div>

      {/* Canvas */}
      <div
        style={{ overflow: "auto", height: 520, cursor: isPanning ? "grabbing" : "grab", position: "relative" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <svg
          width={CANVAS_W * zoom + Math.abs(panX) + 100}
          height={totalH * zoom + Math.abs(panY) + 100}
          style={{ display: "block" }}
        >
          <g transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
            {renderArrowMarkers()}
            {renderConnections()}
            {renderNodes()}
            {renderEndNode()}
          </g>
        </svg>
      </div>

      {/* Search results count */}
      {searchTerm && matchingIds.size > 0 && (
        <div style={{ padding: "6px 20px", fontSize: 12, color: "#3b82f6", background: "#eff6ff", borderTop: "1px solid #dbeafe" }}>
          找到 {matchingIds.size} 个匹配题目，点击节点可跳转到编辑器
        </div>
      )}
    </div>
  );
}