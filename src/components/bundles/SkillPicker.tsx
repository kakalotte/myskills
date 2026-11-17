import { useMemo, useState } from 'react';
import { cn } from '../../lib/format';
import type { SkillView } from '../../lib/types';
import { Icon } from '../ui/Icon';

interface SkillPickerProps {
  skills: SkillView[];
  selected: ReadonlySet<string>;
  onSelect: (skillName: string) => void;
  onDeselect?: (skillName: string) => void;
  disabled?: boolean;
}

export function SkillPicker({
  skills,
  selected,
  onSelect,
  onDeselect,
  disabled = false,
}: SkillPickerProps) {
  const [query, setQuery] = useState('');

  const filteredSkills = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skills.filter((skill) => {
      if (!q) return true;
      return (
        skill.name.toLowerCase().includes(q) || skill.description.toLowerCase().includes(q)
      );
    });
  }, [skills, query]);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_70%,transparent)] bg-[var(--color-surface-container-lowest,#fff)] p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Icon name="widgets" size={20} className="text-[var(--color-primary,#2563eb)]" />
        <h2 className="text-base font-semibold text-[var(--color-on-surface,#111827)]">技能库挑选池</h2>
      </div>

      <div className="relative w-full">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[var(--color-outline,#94a3b8)]">
          search
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索技能名称或说明…"
          className="h-10 w-full rounded-lg border border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_80%,transparent)] bg-[var(--color-surface-container-lowest)] pl-10 pr-3 text-sm text-[var(--color-on-surface,#111827)] outline-none placeholder:text-[var(--color-outline,#94a3b8)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary,#2563eb)_20%,transparent)]"
        />
      </div>

      <div className="flex max-h-[560px] flex-col gap-2 overflow-y-auto pr-1">
        {filteredSkills.map((skill) => {
          const isSelected = selected.has(skill.name);
          return (
            <button
              key={skill.id}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (isSelected) onDeselect?.(skill.name);
                else onSelect(skill.name);
              }}
              className={cn(
                'flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-all',
                isSelected
                  ? 'border-[color-mix(in_srgb,var(--color-primary,#2563eb)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-primary,#2563eb)_6%,var(--color-surface,#fff))] ring-1 ring-[color-mix(in_srgb,var(--color-primary,#2563eb)_20%,transparent)]'
                  : 'border-[color-mix(in_srgb,var(--color-outline-variant,#d7dee8)_60%,transparent)] bg-[var(--color-surface-container-lowest)] hover:bg-[var(--color-surface-container-low,#fbfcfd)]',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-[var(--color-on-surface,#111827)]">{skill.name}</span>
                {isSelected ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--color-primary,#2563eb)]">
                    <Icon name="check" size={14} />
                    已添加
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--color-on-surface-variant,#4b5563)]">
                    <Icon name="add" size={15} />
                    添加
                  </span>
                )}
              </div>
              <p className="line-clamp-2 text-xs leading-relaxed text-[var(--color-on-surface-variant,#6b7280)]">
                {skill.description || '暂无描述'}
              </p>
            </button>
          );
        })}
        {filteredSkills.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--color-on-surface-variant,#6b7280)]">
            {skills.length === 0 ? '中央库暂无技能' : '没有匹配的技能'}
          </p>
        ) : null}
      </div>
    </section>
  );
}


