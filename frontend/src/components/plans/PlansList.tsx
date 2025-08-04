import React, { useState } from 'react';
import { 
  FileText, 
  CheckCircle2, 
  Clock, 
  Archive,
  RefreshCw,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  Calendar,
  Monitor,
  Hash
} from 'lucide-react';
import clsx from 'clsx';
import { usePlans, useUpdatePlan, useDeletePlan } from '../../hooks';
import type { ClaudeCodePlan, ClaudeCodePlanStatus } from '../../types';

interface PlansListProps {
  projectId: string;
}

const statusIcons = {
  accepted: CheckCircle2,
  implemented: Clock,
  archived: Archive,
};

const statusColors = {
  accepted: 'text-green-500',
  implemented: 'text-blue-500', 
  archived: 'text-gray-500',
};

const statusBadgeColors = {
  accepted: 'text-green-700 bg-green-50 border-green-200',
  implemented: 'text-blue-700 bg-blue-50 border-blue-200',
  archived: 'text-gray-700 bg-gray-50 border-gray-200',
};

export const PlansList: React.FC<PlansListProps> = ({ projectId }) => {
  const [selectedPlans, setSelectedPlans] = useState<string[]>([]);
  const [expandedPlans, setExpandedPlans] = useState<string[]>([]);

  // Use the custom hooks for plans data and mutations
  const { data: plansData, isLoading, error, refetch } = usePlans(projectId);
  const updatePlanMutation = useUpdatePlan();
  const deletePlanMutation = useDeletePlan();

  const plans = plansData?.plans || [];

  const handlePlanSelect = (planId: string) => {
    setSelectedPlans(prev => 
      prev.includes(planId) 
        ? prev.filter(id => id !== planId)
        : [...prev, planId]
    );
  };

  const handlePlanExpand = (planId: string) => {
    setExpandedPlans(prev => 
      prev.includes(planId)
        ? prev.filter(id => id !== planId)
        : [...prev, planId]
    );
  };

  const handleStatusChange = (plan: ClaudeCodePlan, newStatus: string) => {
    updatePlanMutation.mutate({ 
      id: plan.id, 
      data: { status: newStatus as ClaudeCodePlanStatus }
    });
  };

  const handleDelete = async (planId: string) => {
    if (confirm('Are you sure you want to delete this plan?')) {
      await deletePlanMutation.mutateAsync(planId);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getContentPreview = (content: string, maxLength = 120) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  const renderPlan = (plan: ClaudeCodePlan) => {
    const StatusIcon = statusIcons[plan.status];
    const isSelected = selectedPlans.includes(plan.id);
    const isExpanded = expandedPlans.includes(plan.id);

    return (
      <div
        key={plan.id}
        className={clsx(
          'group flex items-start space-x-3 p-3 md:p-4 rounded-lg border transition-all duration-200',
          'min-h-[100px] md:min-h-auto', // Touch-friendly minimum height
          isSelected 
            ? 'bg-blue-50 border-blue-200' 
            : 'bg-white border-gray-200 hover:border-gray-300'
        )}
        data-testid={`claude-plan-item-${plan.id}`}
      >
        <button
          onClick={() => handlePlanSelect(plan.id)}
          className="mt-1 flex-shrink-0 p-2 md:p-1 -m-2 md:-m-1 min-h-[44px] min-w-[44px] md:min-h-auto md:min-w-auto flex items-center justify-center"
          data-testid={`claude-plan-select-${plan.id}`}
        >
          <StatusIcon 
            className={clsx(
              'w-5 h-5 transition-colors duration-200',
              statusColors[plan.status]
            )}
          />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm md:text-base font-medium text-gray-900 mb-1 leading-tight">
                {plan.title}
              </p>
              
              <p className="text-xs md:text-sm text-gray-600 mb-2 md:mb-3 leading-relaxed">
                {isExpanded ? plan.content : getContentPreview(plan.content, 80)}
              </p>

              {plan.content.length > 120 && (
                <button
                  onClick={() => handlePlanExpand(plan.id)}
                  className="flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-800 mb-3"
                >
                  {isExpanded ? (
                    <>
                      <ChevronDown className="w-3 h-3" />
                      <span>Show less</span>
                    </>
                  ) : (
                    <>
                      <ChevronRight className="w-3 h-3" />
                      <span>Show more</span>
                    </>
                  )}
                </button>
              )}
              
              <div className="flex items-center flex-wrap gap-2 md:gap-4">
                <span className={clsx(
                  'inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border',
                  statusBadgeColors[plan.status]
                )}>
                  <StatusIcon className="w-3 h-3 mr-1" />
                  <span className="hidden sm:inline">{plan.status}</span>
                  <span className="sm:hidden">{plan.status.charAt(0).toUpperCase()}</span>
                </span>

                <div className="flex items-center space-x-1 text-xs text-gray-500">
                  <Calendar className="w-3 h-3" />
                  <span className="hidden md:inline">{formatDate(plan.capturedAt)}</span>
                  <span className="md:hidden">{formatDate(plan.capturedAt).split('/')[0]}/{formatDate(plan.capturedAt).split('/')[2]}</span>
                </div>

                {plan.sessionId && (
                  <div className="hidden sm:flex items-center space-x-1 text-xs text-gray-500">
                    <Hash className="w-3 h-3" />
                    <span className="font-mono">{plan.sessionId.substring(0, 8)}</span>
                  </div>
                )}

                {plan.metadata && (plan.metadata as any)?.cwd && (
                  <div className="hidden md:flex items-center space-x-1 text-xs text-gray-500">
                    <Monitor className="w-3 h-3" />
                    <span className="font-mono">
                      {((plan.metadata as any).cwd as string).split('/').pop()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2 ml-2 md:ml-4 flex-shrink-0">
              <select
                value={plan.status}
                onChange={(e) => handleStatusChange(plan, e.target.value)}
                className="text-xs border border-gray-300 rounded px-2 py-1 opacity-70 md:opacity-0 md:group-hover:opacity-100 transition-opacity min-h-[36px] md:min-h-auto"
                disabled={updatePlanMutation.isPending}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="accepted">Accepted</option>
                <option value="implemented">Implemented</option>
                <option value="archived">Archived</option>
              </select>
              
              <button
                onClick={() => handleDelete(plan.id)}
                className="p-2 md:p-1 text-gray-400 hover:text-red-500 rounded opacity-70 md:opacity-0 md:group-hover:opacity-100 transition-opacity min-h-[44px] min-w-[44px] md:min-h-auto md:min-w-auto flex items-center justify-center"
                title="Delete plan"
                data-testid={`claude-plan-delete-${plan.id}`}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="flex items-start space-x-3 p-4 bg-gray-100 rounded-lg">
              <div className="w-5 h-5 bg-gray-300 rounded-full mt-1" />
              <div className="flex-1">
                <div className="w-3/4 h-4 bg-gray-300 rounded mb-2" />
                <div className="w-full h-3 bg-gray-200 rounded mb-2" />
                <div className="w-1/2 h-3 bg-gray-200 rounded mb-3" />
                <div className="flex space-x-2">
                  <div className="w-16 h-5 bg-gray-300 rounded" />
                  <div className="w-20 h-5 bg-gray-300 rounded" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-600">
          Error loading plans: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center space-x-3">
          <FileText className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Claude Code Plans</h3>
          <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-md text-sm font-medium">
            {plans.length}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => refetch()}
            className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors min-h-[44px]"
            data-testid="claude-plan-refresh-button"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {selectedPlans.length > 0 && (
            <span className="text-sm text-gray-500">
              {selectedPlans.length} selected
            </span>
          )}
        </div>
      </div>

      {/* Plans List */}
      {plans.length > 0 ? (
        <div className="space-y-3">
          {plans.map(renderPlan)}
        </div>
      ) : (
        <div className="text-center py-12">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h4 className="text-lg font-medium text-gray-900 mb-2">No Claude Code plans</h4>
          <p className="text-gray-500 mb-6">
            Plans from Claude Code's plan mode will appear here automatically.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
            <p className="text-sm text-blue-800">
              <strong>Tip:</strong> Use Claude Code's plan mode to create plans that persist in Baton. 
              Configure the PostToolUse hook for ExitPlanMode to enable automatic plan capture.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};