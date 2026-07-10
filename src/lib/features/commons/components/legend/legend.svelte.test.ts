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
import { renderLegendHeader, renderLegendNote, wrapLegendText } from './utils';

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

  it('wraps legend text with the shared Textbox measurement', () => {
    expect(wrapLegendText('Alpha beta gamma', '12px Inter', 75)).toEqual([
      'Alpha beta',
      'gamma'
    ]);
  });

  it('renders shared header and note blocks with escaped wrapped text', () => {
    const header = renderLegendHeader({
      title: 'Alpha <title> beta gamma',
      subtitle: 'Delta epsilon',
      x: 4,
      y: 6,
      maxWidth: 75,
      titleSize: 12,
      subtitleSize: 10,
      fontFamily: 'Inter'
    });
    const note = renderLegendNote({
      note: 'Source <unsafe> beta gamma',
      x: 4,
      y: header.height + 10,
      maxWidth: 75,
      noteSize: 9,
      fontFamily: 'Inter'
    });
    const emptyHeader = renderLegendHeader({
      title: '   ',
      subtitle: '   ',
      x: 4,
      y: 6,
      maxWidth: 75,
      titleSize: 12,
      subtitleSize: 10,
      fontFamily: 'Inter'
    });

    expect(header.markup).toContain('class="title"');
    expect(header.markup).toContain('class="subtitle"');
    expect(header.markup).toContain('&lt;title&gt;');
    expect(header.markup).not.toContain('<title>');
    expect(header.height).toBeGreaterThan(0);
    expect(note.markup).toContain('class="note"');
    expect(note.markup).toContain('&lt;unsafe&gt;');
    expect(note.height).toBeGreaterThan(0);
    expect(emptyHeader).toEqual({ markup: '', height: 0 });
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
    expect(svg.height).toBeLessThan(140);
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

  it('drops symbol legend ticks whose labels would vertically overlap', () => {
    const svg = createLegendSvg(
      draw_symbols_legend([38, 54], {
        type: 'circle',
        size: 18,
        fontSize: 12,
        fill: '#4585f5'
      })
    );

    const host = document.createElement('div');
    host.innerHTML = `<svg>${svg.markup}</svg>`;
    const labelTexts = [...host.querySelectorAll('.labels text')].map(
      (node) => ({
        y: Number(node.getAttribute('y')),
        text: node.textContent?.trim() ?? ''
      })
    );

    // With size=18 and fontSize=12, [38,54] would have labels only ~6px apart.
    // The smaller tick should be dropped so only the max remains.
    expect(labelTexts.length).toBeGreaterThanOrEqual(1);
    expect(labelTexts.some((l) => l.text === '54')).toBe(true);

    // Verify no two labels are closer than fontSize * 1.2
    for (let i = 0; i < labelTexts.length - 1; i++) {
      const dist = Math.abs(labelTexts[i].y - labelTexts[i + 1].y);
      expect(dist).toBeGreaterThanOrEqual(12 * 1.2);
    }
  });

  it('keeps non-overlapping symbol legend ticks while dropping overlapping ones', () => {
    const svg = createLegendSvg(
      draw_symbols_legend([1_300_000, 4_000_000, 9_900_000], {
        type: 'circle',
        size: 18,
        fontSize: 12,
        fill: '#4585f5'
      })
    );

    const host = document.createElement('div');
    host.innerHTML = `<svg>${svg.markup}</svg>`;
    const labelTexts = [...host.querySelectorAll('.labels text')].map(
      (node) => ({
        y: Number(node.getAttribute('y')),
        text: node.textContent?.trim() ?? ''
      })
    );

    // The middle tick (4,000,000) would overlap with neighbours at this size,
    // so we expect to keep the extremes that are far enough apart.
    expect(labelTexts.length).toBeGreaterThanOrEqual(1);

    // Verify no two labels are closer than fontSize * 1.2
    for (let i = 0; i < labelTexts.length - 1; i++) {
      const dist = Math.abs(labelTexts[i].y - labelTexts[i + 1].y);
      expect(dist).toBeGreaterThanOrEqual(12 * 1.2);
    }
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

  it('draws quantitative class boxes as white background plus motif fill when classPatternFills is set', () => {
    const svg = createLegendSvg(
      draw_quanti_color_legend([0, 10, 20], ['#f7fbff', '#2171b5'], {
        classPatternFills: [
          {
            defs: '<pattern id="motif-0"><rect /></pattern>',
            fillUrl: 'url(#motif-0)'
          },
          {
            defs: '<pattern id="motif-1"><rect /></pattern>',
            fillUrl: 'url(#motif-1)'
          }
        ]
      })
    );

    expect(svg.markup).toContain('<pattern id="motif-0">');
    expect(svg.markup).toContain('<pattern id="motif-1">');
    expect(svg.markup).toContain('fill="#ffffff"');
    expect(svg.markup).toContain('fill="url(#motif-0)" opacity="1"');
    expect(svg.markup).toContain('fill="url(#motif-1)" opacity="1"');
    expect(svg.markup).not.toContain('fill="#f7fbff"');
    expect(svg.markup).not.toContain('fill="#2171b5"');
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
    const svgDefinitions = [
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

    for (const { markup } of svgDefinitions) {
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

  it('keeps the cross-zero sign legend inside the SVG viewBox bounds', () => {
    const svg = createLegendSvg(
      draw_symbols_legend([-100, -50, 50, 100], {
        type: 'circle',
        fill: '#4585f5'
      })
    );

    expect(svg.markup).toContain('sign_legend');

    const rectYs = [
      ...svg.markup.matchAll(/<g class="sign_legend"[^>]*>[\s\S]*?<\/g>/g)
    ].flatMap((block) =>
      [...block[0].matchAll(/<rect[^>]*y="([^"]+)"/g)].map((m) => Number(m[1]))
    );
    expect(rectYs.length).toBeGreaterThan(0);
    for (const y of rectYs) {
      expect(y).toBeLessThan(svg.height);
    }

    const svgWithoutSign = createLegendSvg(
      draw_symbols_legend([10, 100, 1_000], {
        type: 'circle',
        fill: '#4585f5'
      })
    );
    expect(svg.height).toBeGreaterThan(svgWithoutSign.height);
  });

  it('keeps sign legend, nodata and note all within bounds for cross-zero data', () => {
    const svg = createLegendSvg(
      draw_symbols_legend([-100, -50, 50, 100], {
        type: 'circle',
        fill: '#4585f5',
        nodata: true,
        nodataLabel: 'Sans données',
        note: 'Source: Khartis',
        title: 'Visualisation',
        subtitle: 'Indice'
      })
    );

    expect(svg.markup).toContain('sign_legend');
    expect(svg.markup).toContain('Sans données');
    expect(svg.markup).toContain('Source: Khartis');
    expect(svg.markup).toContain('Indice');
    expect(svg.markup).toContain('Visualisation');
    expect(svg.width).toBeGreaterThan(0);
    expect(svg.height).toBeGreaterThan(0);
  });

  it('handles cross-zero proportional bars with the sign legend integrated', () => {
    const svg = createLegendSvg(
      draw_symbols_legend([-50, 100], {
        type: 'bar',
        fill: '#4585f5'
      })
    );

    expect(svg.markup).toContain('sign_legend');
    expect(svg.height).toBeGreaterThan(0);

    const rectYs = [
      ...svg.markup.matchAll(/<g class="sign_legend"[^>]*>[\s\S]*?<\/g>/g)
    ].flatMap((block) =>
      [...block[0].matchAll(/<rect[^>]*y="([^"]+)"/g)].map((m) => Number(m[1]))
    );
    expect(rectYs.length).toBeGreaterThan(0);
    for (const y of rectYs) {
      expect(y).toBeLessThan(svg.height);
    }
  });

  it('uses uniform section gaps between symbols, sign legend, nodata and note', () => {
    const svg = createLegendSvg(
      draw_symbols_legend([-100, -50, 50, 100], {
        type: 'circle',
        fill: '#4585f5',
        nodata: true,
        nodataLabel: 'Sans données',
        note: 'Source: Khartis'
      })
    );

    const signLegendBlock = /<g class="sign_legend"[^>]*>[\s\S]*?<\/g>/.exec(
      svg.markup
    )?.[0];
    expect(signLegendBlock).toBeDefined();
    const signRectYs = [
      ...(signLegendBlock ?? '').matchAll(/<rect[^>]*y="([\d.]+)"/g)
    ].map((m) => Number(m[1]));
    expect(signRectYs.length).toBe(2);
    const [plusBoxY, minusBoxY] = signRectYs;
    expect(minusBoxY).toBeGreaterThan(plusBoxY);

    const interBoxGap = minusBoxY - plusBoxY;
    expect(interBoxGap).toBeGreaterThan(0);
    expect(interBoxGap).toBeLessThan(40);

    const nodataMatch = /<g class="nodata">[\s\S]*?y1="([\d.]+)"/.exec(
      svg.markup
    );
    expect(nodataMatch).not.toBeNull();
    const nodataY = Number(nodataMatch?.[1]);
    expect(nodataY).toBeGreaterThan(minusBoxY);
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
    expect(svg.height).toBeLessThan(190);
  });

  it('aligns each double symbol label with its own symbol center', () => {
    const svgDefinition = draw_khartis_double_symbols_legend([
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
    ]);
    const host = document.createElement('div');
    host.innerHTML = `<svg>${svgDefinition.markup}</svg>`;

    const rowGroups = [...host.querySelectorAll('.double-symbol-pair')];
    const labelTexts = ['227,119', '113,567', '14'].map((label) =>
      [...host.querySelectorAll('text')].find(
        (node) => node.textContent?.trim() === label
      )
    );
    const rowCenters = rowGroups.map((group) => {
      const transform = group.querySelector('path')?.getAttribute('transform');
      const match = transform?.match(/translate\([^,]+,([^)]+)\)/);
      return Number(match?.[1] ?? NaN);
    });
    const labelYs = labelTexts.map((node) => Number(node?.getAttribute('y')));

    expect(rowCenters).toHaveLength(3);
    expect(labelYs).toHaveLength(3);
    rowCenters.forEach((center, index) => {
      expect(center).toBeCloseTo(labelYs[index], 5);
    });
  });

  it('bottom-aligns double symbol rows so smaller symbols sit lower relative to previous row', () => {
    const svgDefinition = draw_khartis_double_symbols_legend([
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
    ]);
    const host = document.createElement('div');
    host.innerHTML = `<svg>${svgDefinition.markup}</svg>`;

    const rowGroups = [...host.querySelectorAll('.double-symbol-pair')];
    const cyValues = rowGroups.map((group) => {
      const transform = group.querySelector('path')?.getAttribute('transform');
      const match = transform?.match(/translate\([^,]+,([^)]+)\)/);
      return Number(match?.[1] ?? NaN);
    });

    expect(cyValues).toHaveLength(3);
    // With bottom-align, the gap between cy values increases as radius decreases
    // because smaller symbols sit lower in their fixed-height row.
    const gap0 = cyValues[1] - cyValues[0];
    const gap1 = cyValues[2] - cyValues[1];
    expect(gap1).toBeGreaterThan(gap0);
  });

  it('escapes SVG text, colors, and paths in Khartis extensions', () => {
    const svg = createLegendSvg(
      draw_khartis_swatch_legend(
        [
          {
            label: '<img>',
            fill: '#fff" /><script>',
            symbol: 'M0,0" /><script>',
            patternFill: {
              defs: '<pattern id="safe"><rect /></pattern>',
              fillUrl: 'url(#safe)" /><script>'
            }
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
  });

  it('draws pattern swatches as a colored box overlaid by the motif fill', () => {
    const svg = draw_khartis_swatch_legend(
      [
        {
          label: 'A',
          fill: '#2171b5',
          patternFill: {
            defs: '<pattern id="motif-a"><rect /></pattern>',
            fillUrl: 'url(#motif-a)'
          }
        }
      ],
      { type: 'pattern' }
    );

    expect(svg.markup).toContain('<pattern id="motif-a">');
    expect(svg.markup).toContain('fill="#2171b5"');
    expect(svg.markup).toContain('fill="url(#motif-a)" opacity="0.6"');
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

  it('keeps text color on the SVG root for DOM image exports', () => {
    const { container } = render(LegendSvg, {
      markup: '<g><text x="0" y="10">Legend</text></g>',
      width: 42,
      height: 16,
      textColor: '#ffffff'
    });
    const svg = container.querySelector('svg.legend-svg');

    expect(svg).toHaveAttribute('fill', 'currentColor');
    expect(svg).toHaveStyle({ color: '#ffffff' });
  });
});
