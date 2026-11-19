import { useState } from 'react';
import { cn } from '../../lib/format';
import {
  agentFallbackBg,
  agentMarkLabel,
  getAgentIconSrc,
  getAgentIconTreatment,
} from '../../lib/agentIcons';

interface AgentMarkProps {
  agentId: string;
  agentName?: string;
  size?: number;
  className?: string;
  /** Explicit icon URL (asset path or data URL) for custom Agents. */
  src?: string | null;
}

export function AgentMark({ agentId, agentName, size = 16, className, src }: AgentMarkProps) {
  const [failed, setFailed] = useState(false);
  const resolved = failed ? null : (src ?? getAgentIconSrc(agentId));
  // Some brand SVGs are single-ink or have a near-black tile; `styles/theme.css`
  // uses this marker to keep them legible on dark surfaces.
  const treatment = getAgentIconTreatment();

  if (resolved) {
    return (
      <img
        src={resolved}
        alt=""
        aria-hidden="true"
        data-agent-icon={treatment === 'default' ? undefined : treatment}
        width={size}
        height={size}
        className={cn('shrink-0 object-contain', className)}
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
        loading="lazy"
        decoding="async"
      />
    );
  }

  const label = agentMarkLabel(agentId, agentName);
  const bg = agentFallbackBg(agentId);
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-mono font-semibold text-white',
        className,
      )}
      style={{ width: size, height: size, backgroundColor: bg, fontSize: Math.max(9, size * 0.38) }}
    >
      {label}
    </span>
  );
}
