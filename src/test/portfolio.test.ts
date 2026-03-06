import { calculatePositionFromTrades, formatCurrency } from "@/lib/portfolio";

describe("calculatePositionFromTrades", () => {
  it("updates average cost after multiple buys", () => {
    const result = calculatePositionFromTrades([
      {
        id: 1,
        side: "buy",
        quantity: 2,
        price: 100,
        fee: 2,
        tradedAt: "2026-01-01T10:00:00.000Z",
      },
      {
        id: 2,
        side: "buy",
        quantity: 1,
        price: 130,
        fee: 1,
        tradedAt: "2026-01-01T11:00:00.000Z",
      },
    ]);

    expect(result.quantity).toBe(3);
    expect(result.costBasis).toBeCloseTo(333, 8);
    expect(result.avgCost).toBeCloseTo(111, 8);
  });

  it("computes realized pnl for partial sell including fees", () => {
    const result = calculatePositionFromTrades([
      {
        id: 1,
        side: "buy",
        quantity: 2,
        price: 100,
        fee: 0,
        tradedAt: "2026-01-01T10:00:00.000Z",
      },
      {
        id: 2,
        side: "sell",
        quantity: 1,
        price: 130,
        fee: 2,
        tradedAt: "2026-01-02T10:00:00.000Z",
      },
    ]);

    expect(result.quantity).toBe(1);
    expect(result.avgCost).toBeCloseTo(100, 8);
    expect(result.realizedPnl).toBeCloseTo(28, 8);
  });

  it("handles full close to zero balance", () => {
    const result = calculatePositionFromTrades([
      {
        id: 1,
        side: "buy",
        quantity: 1.5,
        price: 200,
        fee: 1,
        tradedAt: "2026-01-01T10:00:00.000Z",
      },
      {
        id: 2,
        side: "sell",
        quantity: 1.5,
        price: 210,
        fee: 1,
        tradedAt: "2026-01-03T10:00:00.000Z",
      },
    ]);

    expect(result.quantity).toBe(0);
    expect(result.costBasis).toBe(0);
  });

  it("rejects sells larger than holdings", () => {
    expect(() =>
      calculatePositionFromTrades([
        {
          id: 1,
          side: "sell",
          quantity: 1,
          price: 10,
          fee: 0,
          tradedAt: "2026-01-01T10:00:00.000Z",
        },
      ]),
    ).toThrow(/exceeds current holdings/i);
  });
});

describe("formatCurrency", () => {
  it("formats CAD values with cents", () => {
    expect(formatCurrency(1234.567)).toBe("$1,234.57");
    expect(formatCurrency(-20.1)).toBe("-$20.10");
  });
});
