import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TitleBar } from './TitleBar';

describe('TitleBar', () => {
  it('uses a deep Tauri drag region on the header but not on window controls', () => {
    const { container } = render(<TitleBar />);

    const header = container.querySelector('header');
    expect(header).not.toBeNull();
    // Tauri treats a bare attribute as "direct clicks only"; the header is
    // covered by children, so drag only works with the `deep` value.
    expect(header?.getAttribute('data-tauri-drag-region')).toBe('deep');

    for (const label of ['最小化', '最大化', '关闭']) {
      const button = screen.getByRole('button', { name: label });
      expect(button.getAttribute('data-tauri-drag-region')).toBe('false');
    }
  });
});
