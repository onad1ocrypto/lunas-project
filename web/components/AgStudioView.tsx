"use client";

/* =========================================================
   The AG Studio instance itself.

   Loaded lazily (never server-rendered): the package is large and only this
   page needs it. Two things worth knowing:

   - The starter report below is a plain state object, exactly the shape
     `api.getState()` returns, so what a judge sees on load is a finished
     dashboard they can then reshape (drag fields, cross-filter, add widgets).
   - The licence key is a front-end key by design (AG Studio licences are
     validated in the browser). It is a hackathon trial for evaluation only.
   ========================================================= */

import { useMemo } from "react";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { createStudioTheme, type AgReportState } from "ag-studio";
import { INSIGHT_SOURCES } from "@/lib/insights";

/* ---------- Lunas palette, in the form Studio's theme expects ---------- */

const INK = "#231A42";
const PAPER = "#FFFDF8";
const CREAM = "#FFF7EC";

const lunasTheme = createStudioTheme().withParams({
  fontFamily: "Nunito, system-ui, sans-serif",
  fontSize: 13,
  borderWidth: 2,
  borderColor: INK,
  borderRadius: 14,
  backgroundColor: PAPER,
  textColor: INK,

  accentColor: "#0E7A4D",
  studioCanvasBackgroundColor: CREAM,
  studioCanvasFontFamily: "Nunito, system-ui, sans-serif",
  studioPanelWidth: 190,
  studioWidgetBackgroundColor: "#FFFFFF",
  studioWidgetBorder: { width: 2, color: INK, style: "solid" },
  studioWidgetBorderRadius: 16,
  studioWidgetTitleFontFamily: "Fraunces, Georgia, serif",
  studioWidgetTitleFontSize: 18,
  studioWidgetTitleTextColor: INK,
  studioWidgetSubtitleFontFamily: "Nunito, system-ui, sans-serif",
  studioWidgetSubtitleFontSize: 12,
  studioWidgetSubtitleTextColor: "#6B6488",

  gridHeaderBackgroundColor: "#FDE9C8",
  gridOddRowBackgroundColor: "#FFFBF3",
  gridDataBackgroundColor: "#FFFFFF",

  chartFontFamily: "Nunito, system-ui, sans-serif",
  chartTextColor: INK,
  chartAxisLineColor: "#231A4266",
  chartGridLineColor: "#231A421F",
  // Lunas's pastels, used for the first six series
  chartPaletteFills1Color: "#F5C24E",
  chartPaletteFills2Color: "#7FD1AE",
  chartPaletteFills3Color: "#8FC7EE",
  chartPaletteFills4Color: "#F2A9C4",
  chartPaletteFills5Color: "#C9B6F5",
  chartPaletteFills6Color: "#F6B78A",
  chartPaletteStrokes1Color: "#B58A18",
  chartPaletteStrokes2Color: "#0E7A4D",
  chartPaletteStrokes3Color: "#2A6C99",
  chartPaletteStrokes4Color: "#B1567A",
  chartPaletteStrokes5Color: "#6A50A8",
  chartPaletteStrokes6Color: "#B26534",
});

/* ---------- starter report ---------- */

const f = (id: string, aggregation?: "sum" | "avg" | "count" | "countd" | "min" | "max") =>
  aggregation ? { id, aggregation } : { id };
const title = (text: string) => ({ title: { text, enabled: true } });

const STARTER_STATE = {
  pages: [
    {
      id: "page-money",
      widgets: {
        // row 1 — the four headline numbers
        /* Deliberately different metrics from the tiles above, so the page never
           shows two numbers with the same label and different meanings. */
        kpi_contracted: {
          type: "value",
          format: { ...title("Total contracted"), style: { typography: { fontSize: 30, fontWeight: "bold" } } },
          dataMapping: { value: [f("orders.amount", "sum")] },
        },
        kpi_fees: {
          type: "value",
          format: { ...title("Fees on the books"), style: { typography: { fontSize: 30, fontWeight: "bold" } } },
          dataMapping: { value: [f("orders.fee", "sum")] },
        },
        kpi_orders: {
          type: "value",
          format: { ...title("Orders"), style: { typography: { fontSize: 30, fontWeight: "bold" } } },
          dataMapping: { value: [f("orders.id", "count")] },
        },
        kpi_attempts: {
          type: "value",
          format: { ...title("Avg. delivery attempts"), style: { typography: { fontSize: 30, fontWeight: "bold" } } },
          dataMapping: { value: [f("orders.attempts", "avg")] },
        },

        // row 2 — the money picture
        money_by_month: {
          type: "column-chart-grouped",
          format: title("Money in vs money out, by month"),
          dataMapping: {
            categoryKey: [f("orders.createdAt")],
            valueKey: [f("orders.amount", "sum"), f("orders.net", "sum")],
          },
        },
        stages: {
          type: "donut-chart",
          format: title("Where the orders stand"),
          dataMapping: { categoryKey: [f("orders.stage")], valueKey: [f("orders.id", "count")] },
        },

        // row 3 — the work behind the money
        countries: {
          type: "bar-chart-grouped",
          format: title("Clients by country"),
          dataMapping: { categoryKey: [f("orders.countryName")], valueKey: [f("orders.id", "count")] },
        },
        fee_mix: {
          type: "bar-chart-grouped",
          format: title("PayPal events by type"),
          dataMapping: { categoryKey: [f("money_events.kind")], valueKey: [f("money_events.id", "count")] },
        },
        latency: {
          type: "line-chart",
          format: title("Agent latency (ms)"),
          dataMapping: {
            categoryKey: [f("agent_runs.agent")],
            valueKey: [f("agent_runs.latencyMs", "avg")],
          },
        },
        orders_grid: {
          type: "grid",
          format: title("Orders"),
          dataMapping: {
            cols: [
              f("orders.id"),
              f("orders.client"),
              f("orders.countryName"),
              f("orders.amount", "sum"),
              f("orders.net", "sum"),
              f("orders.stage"),
              f("orders.attempts", "avg"),
              f("orders.engine"),
              f("orders.daysToPay", "avg"),
            ],
          },
        },
      },
      widgetLayout: {
        kpi_contracted: { xTrack: 0, yTrack: 0, xSpan: 6, ySpan: 6 },
        kpi_fees: { xTrack: 6, yTrack: 0, xSpan: 6, ySpan: 6 },
        kpi_orders: { xTrack: 12, yTrack: 0, xSpan: 6, ySpan: 6 },
        kpi_attempts: { xTrack: 18, yTrack: 0, xSpan: 6, ySpan: 6 },

        money_by_month: { xTrack: 0, yTrack: 6, xSpan: 15, ySpan: 17 },
        stages: { xTrack: 15, yTrack: 6, xSpan: 9, ySpan: 17 },

        countries: { xTrack: 0, yTrack: 23, xSpan: 8, ySpan: 16 },
        fee_mix: { xTrack: 8, yTrack: 23, xSpan: 8, ySpan: 16 },
        latency: { xTrack: 16, yTrack: 23, xSpan: 8, ySpan: 16 },

        orders_grid: { xTrack: 0, yTrack: 39, xSpan: 24, ySpan: 10 },
      },
    },
  ],
  selectedPageId: "page-money",
  panels: {
    // Open with the canvas full width — the dashboard is the first impression.
    // The build panels are one click away, and their state is part of the report.
    filters: { collapsed: true },
    edit: { collapsed: true },
    data: { collapsed: true },
  },
} as unknown as AgReportState;

export default function AgStudioView() {
  const data = useMemo(() => ({ sources: INSIGHT_SOURCES }), []);
  const licenseKey = process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE;

  return (
    <div style={{ height: "100%", width: "100%" }} data-testid="ag-studio">
      <AgStudioProvider licenseKey={licenseKey}>
        <AgStudio
          data={data}
          mode="edit"
          theme={lunasTheme}
          initialState={STARTER_STATE}
          studioId="lunas-insights"
        />
      </AgStudioProvider>
    </div>
  );
}
