// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { stepNumberInputOnShiftArrow } from './number-input-step.utils';

function numberInput(attributes: Record<string, string>): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'number';
  Object.entries(attributes).forEach(([name, value]) =>
    input.setAttribute(name, value)
  );
  document.body.append(input);
  return input;
}

function press(
  input: HTMLInputElement,
  key: string,
  shiftKey = true
): { handled: boolean; inputEvents: number } {
  let inputEvents = 0;
  input.addEventListener('input', () => (inputEvents += 1));
  const event = new KeyboardEvent('keydown', { key, shiftKey });
  Object.defineProperty(event, 'target', { value: input });
  return { handled: stepNumberInputOnShiftArrow(event), inputEvents };
}

describe('stepNumberInputOnShiftArrow', () => {
  it('moves by ten steps and notifies the field', () => {
    const input = numberInput({ value: '12', step: '0.5' });
    expect(press(input, 'ArrowUp')).toEqual({ handled: true, inputEvents: 1 });
    expect(input.value).toBe('17');

    press(input, 'ArrowDown');
    expect(input.value).toBe('12');
  });

  it('stops at the bounds of the field', () => {
    const input = numberInput({ value: '95', min: '0', max: '100' });
    press(input, 'ArrowUp');
    expect(input.value).toBe('100');

    input.value = '4';
    press(input, 'ArrowDown');
    expect(input.value).toBe('0');
  });

  it('leaves plain arrows and other fields to the browser', () => {
    const input = numberInput({ value: '3' });
    expect(press(input, 'ArrowUp', false).handled).toBe(false);
    expect(input.value).toBe('3');

    const text = document.createElement('input');
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowUp',
      shiftKey: true
    });
    Object.defineProperty(event, 'target', { value: text });
    expect(stepNumberInputOnShiftArrow(event)).toBe(false);
  });
});
