
import React from 'react';
import { ShipmentStatus } from '../types';

interface ShipmentFunnelData {
  label: ShipmentStatus;
  value: number;
}

interface ShipmentFunnelCardProps {
  title: string;
  data: ShipmentFunnelData[];
  className?: string;
}

const ShipmentFunnelCard: React.FC<ShipmentFunnelCardProps> = ({ title, data, className = '' }) => {
  const maxValue = Math.max(...data.map(item => item.value), 1); // Use 1 to avoid division by zero

  return (
    <div className={`bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md ${className}`}>
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4">{title}</h3>
      <div className="space-y-4">
        {data.map((item, index) => (
          <div key={index} className="w-full">
            <div className="flex justify-between items-center mb-1 text-sm">
              <span className="font-medium text-gray-600 dark:text-gray-400">{item.label}</span>
              <span className="font-bold text-gray-800 dark:text-gray-200">{item.value}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4 dark:bg-gray-700">
              <div
                className="bg-primary h-4 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${(item.value / maxValue) * 100}%` }}
              ></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ShipmentFunnelCard;
