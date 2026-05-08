import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RadioGroup, RadioGroupItem } from '../radio-group';

describe('RadioGroup Component', () => {
  it('renders correctly and allows selection', () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup defaultValue="option-1" onValueChange={onValueChange}>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="option-1" id="option-1" />
          <label htmlFor="option-1">Option 1</label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="option-2" id="option-2" />
          <label htmlFor="option-2">Option 2</label>
        </div>
      </RadioGroup>
    );

    expect(screen.getByLabelText('Option 1')).toBeDefined();
    expect(screen.getByLabelText('Option 2')).toBeDefined();

    fireEvent.click(screen.getByLabelText('Option 2'));
    expect(onValueChange).toHaveBeenCalledWith('option-2');
  });
});
