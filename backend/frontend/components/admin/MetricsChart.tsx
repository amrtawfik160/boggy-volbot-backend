'use client'

import dynamic from 'next/dynamic'
import { ApexOptions } from 'apexcharts'

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false })

interface MetricsChartProps {
  title: string
  data: number[]
  categories: string[]
  type?: 'line' | 'area' | 'bar'
  height?: number
}

export default function MetricsChart({
  title,
  data,
  categories,
  type = 'area',
  height = 200,
}: MetricsChartProps) {
  const options: ApexOptions = {
    chart: {
      toolbar: { show: false },
      zoom: { enabled: false },
      background: 'transparent',
    },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 2 },
    colors: ['#3b82f6'],
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.4,
        opacityTo: 0.1,
        stops: [0, 90, 100],
      },
    },
    xaxis: {
      categories,
      labels: {
        style: {
          colors: '#6b7280',
          fontSize: '12px',
        },
      },
    },
    yaxis: {
      labels: {
        style: {
          colors: '#6b7280',
          fontSize: '12px',
        },
      },
    },
    grid: {
      borderColor: '#e5e7eb',
      strokeDashArray: 4,
    },
    tooltip: {
      theme: 'light',
      x: { show: true },
      y: {
        formatter: (val: number) => val.toFixed(0),
      },
    },
  }

  const series = [
    {
      name: title,
      data,
    },
  ]

  return (
    <div className="w-full">
      <h4 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">{title}</h4>
      <Chart options={options} series={series} type={type} height={height} />
    </div>
  )
}
