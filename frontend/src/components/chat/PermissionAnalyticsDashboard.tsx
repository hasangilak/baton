import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
  Eye,
  Timer,
  Zap
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from '@/components/ui/button';
import { useInteractivePrompts } from '../../hooks/useInteractivePrompts';

interface PermissionAnalyticsDashboardProps {
  conversationId: string;
  className?: string;
  compact?: boolean;
}

interface LiveMetric {
  label: string;
  value: string | number;
  icon: React.ComponentType<any>;
  color: string;
  trend?: 'up' | 'down' | 'stable';
}

export const PermissionAnalyticsDashboard: React.FC<PermissionAnalyticsDashboardProps> = ({
  conversationId,
  className,
  compact = false
}) => {
  const { 
    analyticsData, 
    liveStatus, 
    permissionSummary,
    realtimeAnalytics 
  } = useInteractivePrompts({ 
    conversationId, 
    enableAnalytics: true 
  });

  const [isExpanded, setIsExpanded] = useState(!compact);
  const [liveMetrics, setLiveMetrics] = useState<LiveMetric[]>([]);

  // Calculate live metrics from analytics data
  useEffect(() => {
    if (!analyticsData || !liveStatus) return;

    const metrics: LiveMetric[] = [
      {
        label: 'Total Requests',
        value: analyticsData.summary.totalRequests,
        icon: BarChart3,
        color: 'text-blue-600 bg-blue-50',
        trend: 'stable'
      },
      {
        label: 'Avg Response Time',
        value: `${analyticsData.summary.averageResponseSeconds}s`,
        icon: Timer,
        color: 'text-green-600 bg-green-50',
        trend: analyticsData.summary.averageResponseSeconds < 10 ? 'down' : 'up'
      },
      {
        label: 'Active Permissions',
        value: liveStatus.activePermissions?.length || 0,
        icon: ShieldCheck,
        color: 'text-emerald-600 bg-emerald-50',
        trend: 'stable'
      },
      {
        label: 'Recent Activity',
        value: liveStatus.statistics?.recentRequests || 0,
        icon: Activity,
        color: 'text-orange-600 bg-orange-50',
        trend: 'up'
      }
    ];

    setLiveMetrics(metrics);
  }, [analyticsData, liveStatus]);

  // Risk level distribution colors
  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'LOW': return 'text-green-600 bg-green-50 border-green-200';
      case 'MEDIUM': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'HIGH': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'CRITICAL': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getRiskIcon = (riskLevel: string) => {
    switch (riskLevel) {
      case 'LOW': return ShieldCheck;
      case 'MEDIUM': return Shield;
      case 'HIGH': return ShieldAlert;
      case 'CRITICAL': return AlertTriangle;
      default: return Shield;
    }
  };

  // Decision colors
  const getDecisionColor = (decision: string) => {
    switch (decision) {
      case 'allow_once':
      case 'allow_always': 
        return 'text-green-600 bg-green-50 border-green-200';
      case 'allow_all': 
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'deny': 
        return 'text-red-600 bg-red-50 border-red-200';
      default: 
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  if (!analyticsData && !liveStatus) {
    return (
      <div className={clsx("rounded-lg border border-gray-200 p-4", className)}>
        <div className="flex items-center space-x-2 text-gray-500">
          <BarChart3 className="w-5 h-5" />
          <span className="text-sm">Loading permission analytics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx("rounded-lg border border-gray-200 bg-white shadow-sm", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          <h3 className="text-sm font-medium text-gray-900">Permission Analytics</h3>
          {realtimeAnalytics && (
            <div className="flex items-center space-x-1 px-2 py-1 bg-green-50 border border-green-200 rounded-md">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs text-green-700">Live</span>
            </div>
          )}
        </div>
        
        {compact && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <Eye className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Content */}
      {(!compact || isExpanded) && (
        <div className="p-4 space-y-4">
          {/* Live Metrics Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {liveMetrics.map((metric, index) => {
              const IconComponent = metric.icon;
              return (
                <div
                  key={index}
                  className={clsx(
                    "p-3 rounded-lg border",
                    metric.color
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <IconComponent className="w-4 h-4" />
                    {metric.trend && (
                      <TrendingUp className={clsx(
                        "w-3 h-3",
                        metric.trend === 'up' ? 'text-green-500' :
                        metric.trend === 'down' ? 'text-red-500' : 'text-gray-400'
                      )} />
                    )}
                  </div>
                  <div className="text-lg font-semibold">{metric.value}</div>
                  <div className="text-xs opacity-75">{metric.label}</div>
                </div>
              );
            })}
          </div>

          {/* Risk Level Distribution */}
          {analyticsData?.riskLevelDistribution && Object.keys(analyticsData.riskLevelDistribution).length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center space-x-2">
                <Shield className="w-4 h-4" />
                <span>Risk Distribution</span>
              </h4>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {Object.entries(analyticsData.riskLevelDistribution).map(([risk, count]) => {
                  const RiskIcon = getRiskIcon(risk);
                  return (
                    <div
                      key={risk}
                      className={clsx(
                        "p-2 rounded-md border text-center",
                        getRiskColor(risk)
                      )}
                    >
                      <div className="flex items-center justify-center mb-1">
                        <RiskIcon className="w-3 h-3" />
                      </div>
                      <div className="text-sm font-medium">{count}</div>
                      <div className="text-xs">{risk}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Decision Distribution */}
          {analyticsData?.responsesByDecision && Object.keys(analyticsData.responsesByDecision).length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>User Decisions</span>
              </h4>
              <div className="space-y-2">
                {Object.entries(analyticsData.responsesByDecision)
                  .sort(([,a], [,b]) => (b as number) - (a as number))
                  .map(([decision, count]) => {
                    const percentage = analyticsData.totalPrompts > 0 
                      ? Math.round(((count as number) / analyticsData.totalPrompts) * 100)
                      : 0;
                    
                    return (
                      <div key={decision} className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className={clsx(
                            "w-3 h-3 rounded border",
                            getDecisionColor(decision)
                          )} />
                          <span className="text-sm text-gray-700 capitalize">
                            {decision.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium">{count}</span>
                          <span className="text-xs text-gray-500">({percentage}%)</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Top Tools */}
          {analyticsData?.topTools && analyticsData.topTools.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center space-x-2">
                <Zap className="w-4 h-4" />
                <span>Most Requested Tools</span>
              </h4>
              <div className="space-y-1">
                {analyticsData.topTools.slice(0, 5).map((tool, index) => (
                  <div key={tool.tool} className="flex items-center justify-between py-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono text-gray-500 w-4">#{index + 1}</span>
                      <span className="text-sm text-gray-700 font-mono">{tool.tool}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-900">{tool.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Activity */}
          {liveStatus?.recentActivity && liveStatus.recentActivity.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center space-x-2">
                <Clock className="w-4 h-4" />
                <span>Recent Activity</span>
              </h4>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {liveStatus.recentActivity.slice(0, 5).map((activity: any, index: number) => (
                  <div key={index} className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded">
                    <div className="flex items-center space-x-2">
                      <div className={clsx(
                        "w-2 h-2 rounded-full",
                        activity.status === 'answered' ? 'bg-green-500' :
                        activity.status === 'pending' ? 'bg-yellow-500' : 'bg-gray-400'
                      )} />
                      <span className="font-mono">{activity.toolName}</span>
                      <span className="text-gray-500">
                        {activity.selectedOption ? `→ ${activity.selectedOption}` : 'pending'}
                      </span>
                    </div>
                    <div className="text-gray-500">
                      {activity.responseTime ? `${Math.round(activity.responseTime / 1000)}s` : 'pending'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary Stats */}
          {permissionSummary && (
            <div className="pt-3 border-t border-gray-200">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-lg font-semibold text-gray-900">
                    {permissionSummary.totalRequests}
                  </div>
                  <div className="text-xs text-gray-500">Total Requests</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-gray-900">
                    {permissionSummary.averageResponseTime}s
                  </div>
                  <div className="text-xs text-gray-500">Avg Response</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Compact View */}
      {compact && !isExpanded && permissionSummary && (
        <div className="p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">
              {permissionSummary.totalRequests} requests, {permissionSummary.averageResponseTime}s avg
            </span>
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span className="text-xs text-gray-500">Live</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};