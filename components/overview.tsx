"use client"

import { memo } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

interface OverviewData {
  name: string
  total: number
}

interface OverviewProps {
  data: OverviewData[]
  title?: string
  description?: string
}

export const Overview = memo(function Overview({ data, title = "Overview", description = "Monthly revenue breakdown" }: OverviewProps) {
  const totalRevenue = data.reduce((sum, item) => sum + item.total, 0)

  return (
    <Card className="w-full overflow-hidden border bg-card">
      <CardHeader className="pb-2">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <div className="mt-1">
          <p className="text-2xl font-bold tracking-tight">${totalRevenue.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Total revenue across all months</p>
        </div>
      </CardHeader>
      <CardContent className="p-0 pt-4">
        <ChartContainer
          config={{
            total: {
              label: "Revenue",
              color: "hsl(var(--primary))",
            },
          }}
          className="h-[350px] w-full px-2"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 30 }}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" opacity={0.4} />
              <XAxis
                dataKey="name"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                stroke="hsl(var(--muted-foreground))"
                padding={{ left: 10, right: 10 }}
                tick={{ fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                fontSize={12}
                tickLine={false}
                axisLine={false}
                stroke="hsl(var(--muted-foreground))"
                tickFormatter={(value: number) => `$${value}`}
                tick={{ fill: "hsl(var(--muted-foreground))" }}
              />
              <Bar
                dataKey="total"
                fill="#f7f7fa"
                radius={[6, 6, 0, 0]}
                className="hover:opacity-80 transition-opacity cursor-pointer"
                maxBarSize={60}
              />
              <ChartTooltip
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.1 }}
                content={
                  <ChartTooltipContent indicator="line" formatter={(value) => `$${Number(value).toLocaleString()}`} />
                }
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  )
})

