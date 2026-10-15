import { describe, it, expect, vi } from 'vitest';
import { handleFormKeyDown } from '../../utils/formNavigation';

describe('Form Navigation and Enter Key Rules', () => {
  it('prevents implicit form submission on Enter and moves focus to next field', () => {
    const nextInput = {
      tagName: 'INPUT',
      type: 'text',
      offsetParent: {},
      tabIndex: 0,
      focus: vi.fn(),
      select: vi.fn()
    };

    const currentInput = {
      tagName: 'INPUT',
      type: 'text',
      offsetParent: {},
      tabIndex: 0,
      getAttribute: vi.fn().mockReturnValue(null)
    };

    const mockForm = {
      querySelectorAll: vi.fn().mockReturnValue([currentInput, nextInput])
    };

    const preventDefault = vi.fn();
    const event = {
      key: 'Enter',
      target: currentInput,
      currentTarget: mockForm,
      preventDefault
    };

    handleFormKeyDown(event as unknown as React.KeyboardEvent);

    expect(preventDefault).toHaveBeenCalled();
    expect(nextInput.focus).toHaveBeenCalled();
    expect(nextInput.select).toHaveBeenCalled();
  });

  it('allows normal newline behavior in textareas without preventing default', () => {
    const textarea = {
      tagName: 'TEXTAREA',
      getAttribute: vi.fn().mockReturnValue(null)
    };

    const preventDefault = vi.fn();
    const event = {
      key: 'Enter',
      target: textarea,
      currentTarget: {},
      preventDefault
    };

    handleFormKeyDown(event as unknown as React.KeyboardEvent);

    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('allows combobox to process Enter without preventing default or shifting focus prematurely', () => {
    const combobox = {
      tagName: 'INPUT',
      getAttribute: vi.fn((attr) => (attr === 'role' ? 'combobox' : null))
    };

    const preventDefault = vi.fn();
    const event = {
      key: 'Enter',
      target: combobox,
      currentTarget: {},
      preventDefault
    };

    handleFormKeyDown(event as unknown as React.KeyboardEvent);

    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('does not intercept non-Enter keys', () => {
    const input = {
      tagName: 'INPUT',
      getAttribute: vi.fn().mockReturnValue(null)
    };

    const preventDefault = vi.fn();
    const event = {
      key: 'Tab',
      target: input,
      currentTarget: {},
      preventDefault
    };

    handleFormKeyDown(event as unknown as React.KeyboardEvent);

    expect(preventDefault).not.toHaveBeenCalled();
  });
});
