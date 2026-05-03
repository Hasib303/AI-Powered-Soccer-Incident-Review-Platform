import type { Point2D } from "@/lib/database.types";

const PITCH_LENGTH_M = 105;
const PITCH_WIDTH_M = 68;

const FILL = {
  bg: "#0f1b22",
  line: "#3b5965",
  attacker: "#22d3b5",
  defender: "#f97070",
  ball: "#facc15",
  offside: "rgba(249, 112, 112, 0.7)",
} as const;

function pitchToSvg(pt: Point2D, size: { width: number; height: number }) {
  const x = (pt.x / PITCH_LENGTH_M) * size.width;
  const y = ((PITCH_WIDTH_M - pt.y) / PITCH_WIDTH_M) * size.height;
  return { x, y };
}

/**
 * Top-down 2D pitch with attacker, second-last defender, ball, and the
 * offside line drawn at the defender's pitch x. Pitch is 105m × 68m, drawn
 * inside the SVG viewBox.
 */
export function PitchDiagram({
  attacker,
  defender,
  ball,
  offsideLineX,
  goalLineX,
  ballTrajectory,
  className,
}: {
  attacker?: Point2D | null;
  defender?: Point2D | null;
  ball?: Point2D | null;
  offsideLineX?: number | null;
  goalLineX?: number | null;
  ballTrajectory?: Point2D[];
  className?: string;
}) {
  const w = 1050;
  const h = 680;
  const size = { width: w, height: h };

  const attackerPt = attacker ? pitchToSvg(attacker, size) : null;
  const defenderPt = defender ? pitchToSvg(defender, size) : null;
  const ballPt = ball ? pitchToSvg(ball, size) : null;
  const offsideX =
    offsideLineX != null ? (offsideLineX / PITCH_LENGTH_M) * w : null;
  const goalX = goalLineX != null ? (goalLineX / PITCH_LENGTH_M) * w : null;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      style={{ background: FILL.bg, borderRadius: 12 }}
      role="img"
      aria-label="Top-down pitch diagram showing player and ball positions"
    >
      {/* Pitch outline + halfway + center circle */}
      <rect
        x={6}
        y={6}
        width={w - 12}
        height={h - 12}
        rx={8}
        fill="none"
        stroke={FILL.line}
        strokeWidth={2}
      />
      <line
        x1={w / 2}
        y1={6}
        x2={w / 2}
        y2={h - 6}
        stroke={FILL.line}
        strokeWidth={2}
      />
      <circle
        cx={w / 2}
        cy={h / 2}
        r={91.5}
        fill="none"
        stroke={FILL.line}
        strokeWidth={2}
      />

      {/* Penalty boxes (16.5m deep × 40.3m wide) */}
      {[0, 1].map((side) => {
        const boxWidth = (16.5 / PITCH_LENGTH_M) * w;
        const boxHeight = (40.3 / PITCH_WIDTH_M) * h;
        const x = side === 0 ? 6 : w - 6 - boxWidth;
        const y = (h - boxHeight) / 2;
        return (
          <rect
            key={side}
            x={x}
            y={y}
            width={boxWidth}
            height={boxHeight}
            fill="none"
            stroke={FILL.line}
            strokeWidth={2}
          />
        );
      })}

      {/* Goal-line crossing reference */}
      {goalX != null ? (
        <line
          x1={goalX}
          y1={6}
          x2={goalX}
          y2={h - 6}
          stroke={FILL.line}
          strokeWidth={2}
          strokeDasharray="6 6"
        />
      ) : null}

      {/* Offside line */}
      {offsideX != null ? (
        <line
          x1={offsideX}
          y1={6}
          x2={offsideX}
          y2={h - 6}
          stroke={FILL.offside}
          strokeWidth={3}
          strokeDasharray="10 6"
        />
      ) : null}

      {/* Ball trajectory (goal-line clip) */}
      {ballTrajectory && ballTrajectory.length > 1 ? (
        <polyline
          points={ballTrajectory
            .map((p) => {
              const sp = pitchToSvg(p, size);
              return `${sp.x},${sp.y}`;
            })
            .join(" ")}
          fill="none"
          stroke={FILL.ball}
          strokeWidth={3}
          strokeDasharray="4 4"
          opacity={0.9}
        />
      ) : null}
      {ballTrajectory?.map((p, i) => {
        const sp = pitchToSvg(p, size);
        return (
          <circle
            key={`traj-${i}`}
            cx={sp.x}
            cy={sp.y}
            r={5}
            fill={FILL.ball}
            opacity={0.7}
          />
        );
      })}

      {/* Players + ball markers (drawn last) */}
      {defenderPt ? (
        <PlayerMarker {...defenderPt} fill={FILL.defender} label="D" />
      ) : null}
      {attackerPt ? (
        <PlayerMarker {...attackerPt} fill={FILL.attacker} label="A" />
      ) : null}
      {ballPt ? (
        <circle cx={ballPt.x} cy={ballPt.y} r={9} fill={FILL.ball} stroke="#0b1418" strokeWidth={2} />
      ) : null}
    </svg>
  );
}

function PlayerMarker({
  x,
  y,
  fill,
  label,
}: {
  x: number;
  y: number;
  fill: string;
  label: string;
}) {
  return (
    <g>
      <circle cx={x} cy={y} r={16} fill={fill} stroke="#0b1418" strokeWidth={3} />
      <text
        x={x}
        y={y + 5}
        textAnchor="middle"
        fontSize={16}
        fontWeight={700}
        fill="#0b1418"
        fontFamily="ui-sans-serif, system-ui"
      >
        {label}
      </text>
    </g>
  );
}
