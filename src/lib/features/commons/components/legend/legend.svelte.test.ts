import { render } from '@testing-library/svelte';
import Textbox from '@borgar/textbox';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  LegendSvg,
  createLegendSvg,
  draw_categorical_legend,
  draw_khartis_double_symbols_legend,
  draw_khartis_swatch_legend,
  draw_quanti_color_legend,
  draw_symbols_legend,
  round_thresholds
} from '.';

const measureCanvas = {
  getContext: () => ({
    font: '',
    measureText: (text: string) => ({ width: text.length * 7 })
  })
};

describe('common legend generators', () => {
  beforeAll(() => {
    Textbox.setMeasureCanvas(measureCanvas);
  });

  afterAll(() => {
    Textbox.setMeasureCanvas(null);
  });

  it('draws a quantitative color legend from precomputed thresholds', () => {
    const svg = createLegendSvg(
      draw_quanti_color_legend([0, 10, 20], ['#f7fbff', '#2171b5'], {
        title: 'Population',
        nodata: true,
        nodataLabel: 'Sans données'
      })
    );

    expect(svg.width).toBeGreaterThan(0);
    expect(svg.height).toBeGreaterThan(0);
    expect(svg.markup).toContain('quantitative_legend');
    expect(svg.markup).toContain('Sans données');
    expect(svg.markup).toContain('#2171b5');
  });

  it('draws categorical legends and escapes labels before raw SVG rendering', () => {
    const svg = createLegendSvg(
      draw_categorical_legend([
        {
          label: 'A <script>',
          fill: '#f287ac'
        }
      ])
    );

    expect(svg.markup).toContain('categorical_legend');
    expect(svg.markup).toContain('A &lt;script&gt;');
    expect(svg.markup).not.toContain('A <script>');
  });

  it('keeps categorical missing data compact in the same SVG', () => {
    const svg = createLegendSvg(
      draw_categorical_legend(
        [
          { label: 'Actif', fill: '#4585f5' },
          { label: 'Dormant', fill: '#ff812a' }
        ],
        {
          title: 'Visualisation',
          subtitle: 'Status',
          footerType: 'box',
          footerItems: [
            {
              label: 'Absence de données',
              fill: '#c6c6c6',
              stroke: 'rgba(0, 0, 0, 0.15)'
            }
          ]
        }
      )
    );

    expect(svg.markup).toContain('categorical_legend');
    expect(svg.markup).toContain('Absence de données');
    expect(svg.height).toBeLessThan(135);
  });

  it('draws nested proportional symbol legends from numeric data', () => {
    const svg = createLegendSvg(
      draw_symbols_legend([7, 100_000, 1_000_000], {
        type: 'circle',
        fill: '#4585f5',
        stroke: '#ffffff'
      })
    );

    expect(svg.markup).toContain('symbol_legend');
    expect(svg.markup).toContain('class="links"');
    expect(svg.width).toBeGreaterThan(0);
    expect(svg.height).toBeGreaterThan(0);
  });

  it('widens proportional symbol legends when the missing-data label is long', () => {
    const base = createLegendSvg(
      draw_symbols_legend([10, 100, 1_000], {
        type: 'circle',
        fill: '#4585f5'
      })
    );
    const withNoData = createLegendSvg(
      draw_symbols_legend([10, 100, 1_000], {
        type: 'circle',
        fill: '#4585f5',
        nodata: true,
        nodataLabel: 'Absence de données'
      })
    );

    expect(withNoData.markup).toContain('Absence de données');
    expect(withNoData.width).toBeGreaterThan(base.width);
  });

  it('widens quantitative legends when the missing-data label is long', () => {
    const base = createLegendSvg(
      draw_quanti_color_legend([0, 10, 20], ['#f7fbff', '#2171b5'])
    );
    const withNoData = createLegendSvg(
      draw_quanti_color_legend([0, 10, 20], ['#f7fbff', '#2171b5'], {
        nodata: true,
        nodataLabel: 'Absence de données'
      })
    );

    expect(withNoData.markup).toContain('Absence de données');
    expect(withNoData.width).toBeGreaterThan(base.width);
  });

  it('keeps legend canvases transparent and applies the selected font family', () => {
    const markups = [
      draw_categorical_legend([{ label: 'Actif', fill: '#4585f5' }], {
        fontFamily: 'Cabin'
      }),
      draw_quanti_color_legend([0, 10, 20], ['#f7fbff', '#2171b5'], {
        fontFamily: 'Cabin'
      }),
      draw_symbols_legend([10, 100, 1_000], {
        fontFamily: 'Cabin'
      }),
      draw_khartis_swatch_legend([{ label: 'Actif', fill: '#4585f5' }], {
        fontFamily: 'Cabin'
      })
    ];

    for (const markup of markups) {
      expect(markup).toContain('font-family="&quot;Cabin&quot;, sans-serif"');
      expect(markup).toContain('fill="transparent"');
      expect(markup).not.toContain('fill="white"');
    }
  });

  it('keeps the khartis-legends text symbol variant available for text size legends', () => {
    const svg = createLegendSvg(
      draw_symbols_legend([10, 100, 1_000], {
        type: 'text',
        fill: '#111111',
        stroke: 'none',
        nodata: true,
        nodataLabel: 'Sans données'
      })
    );

    expect(svg.markup).toContain('symbol_legend');
    expect(svg.markup).toContain('Sans données');
    expect(svg.markup).toContain('<path');
  });

  it('keeps round_thresholds exported for khartis-legends parity', () => {
    expect(round_thresholds([10, 20, 30, 40, 50, 60], [10, 31.4, 60])).toEqual([
      10, 31, 60
    ]);
  });

  it('keeps double proportional symbol rows compact', () => {
    const svg = createLegendSvg(
      draw_khartis_double_symbols_legend(
        [
          {
            label: '227,119',
            size: 18,
            symbol: 'M0,-8A8,8,0,1,1,0,8A8,8,0,1,1,0,-8',
            fill: '#4585f5',
            secondaryFill: '#ff812a'
          },
          {
            label: '113,567',
            size: 11,
            symbol: 'M0,-8A8,8,0,1,1,0,8A8,8,0,1,1,0,-8',
            fill: '#4585f5',
            secondaryFill: '#ff812a'
          },
          {
            label: '14',
            size: 4,
            symbol: 'M0,-8A8,8,0,1,1,0,8A8,8,0,1,1,0,-8',
            fill: '#4585f5',
            secondaryFill: '#ff812a'
          }
        ],
        {
          title: 'Visualisation',
          subtitle: 'POP_TOT_2023',
          footerType: 'symbol',
          footerItems: [
            {
              label: 'Absence de données',
              fill: '#c6c6c6',
              symbol: 'M0,-8A8,8,0,1,1,0,8A8,8,0,1,1,0,-8',
              size: 6
            }
          ]
        }
      )
    );

    expect(svg.markup).toContain('khartis_double_symbol_legend');
    expect(svg.markup).toContain('Absence de données');
    expect(svg.height).toBeLessThan(140);
  });

  it('escapes SVG text, colors, and paths in Khartis extensions', () => {
    const svg = createLegendSvg(
      draw_khartis_swatch_legend(
        [
          {
            label: '<img>',
            fill: '#fff" /><script>',
            symbol: 'M0,0" /><script>',
            patternUrl: 'javascript:alert(1)'
          }
        ],
        {
          type: 'symbol',
          title: '<script>'
        }
      )
    );

    expect(svg.markup).toContain('&lt;img&gt;');
    expect(svg.markup).toContain('&lt;script&gt;');
    expect(svg.markup).not.toContain('<script>');
    expect(svg.markup).not.toContain('javascript:alert');
  });

  it('centralizes raw SVG markup rendering in LegendSvg', () => {
    const { container } = render(LegendSvg, {
      markup: '<g class="safe"><rect width="10" height="12" /></g>',
      width: 10,
      height: 12,
      decorative: false,
      ariaLabel: 'Legend'
    });
    const svg = container.querySelector('svg.legend-svg');

    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox', '0 0 10 12');
    expect(svg).toHaveAttribute('role', 'img');
    expect(svg).toHaveAttribute('aria-label', 'Legend');
    expect(container.querySelector('.safe')).toBeInTheDocument();
  });
});
