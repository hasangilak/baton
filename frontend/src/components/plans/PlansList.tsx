import React, { useState } from 'react';
import { usePlans, useUpdatePlan, useDeletePlan } from '../../hooks';
import type { ClaudeCodePlan, ClaudeCodePlanStatus } from '../../types';

interface PlansListProps {
  projectId: string;
}

export const PlansList: React.FC<PlansListProps> = ({ projectId }) => {
  const [selectedPlan, setSelectedPlan] = useState<ClaudeCodePlan | null>(null);

  // Use the custom hooks for plans data and mutations
  const { data: plansData, isLoading, error } = usePlans(projectId);
  const updatePlanMutation = useUpdatePlan();
  const deletePlanMutation = useDeletePlan();

  const plans = plansData?.plans || [];

  const handleStatusChange = (plan: ClaudeCodePlan, newStatus: string) => {
    updatePlanMutation.mutate({ 
      id: plan.id, 
      data: { status: newStatus as ClaudeCodePlanStatus }
    });
  };

  const handleDelete = (plan: ClaudeCodePlan) => {
    if (window.confirm('Are you sure you want to delete this plan?')) {
      // Clear selection if deleting the currently selected plan
      if (selectedPlan?.id === plan.id) {
        setSelectedPlan(null);
      }
      deletePlanMutation.mutate(plan.id);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return 'bg-green-100 text-green-800';
      case 'implemented': return 'bg-blue-100 text-blue-800';
      case 'archived': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
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
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Claude Code Plans</h2>
        <span className="text-sm text-gray-500">
          {plans.length} plan{plans.length !== 1 ? 's' : ''}
        </span>
      </div>

      {plans.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <div className="text-gray-400 mb-2">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No plans yet</h3>
          <p className="text-gray-500">
            Plans from Claude Code's plan mode will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Plans List */}
          <div className="space-y-3">
            {plans.map((plan: ClaudeCodePlan) => (
              <div
                key={plan.id}
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedPlan?.id === plan.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedPlan(plan)}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-medium text-gray-900 truncate">{plan.title}</h3>
                  <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(plan.status)}`}>
                    {plan.status}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                  {plan.content.substring(0, 100)}...
                </p>
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>Captured {formatDate(plan.capturedAt)}</span>
                  {plan.sessionId && (
                    <span className="font-mono">{plan.sessionId.substring(0, 8)}...</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Plan Details */}
          <div className="lg:sticky lg:top-4">
            {selectedPlan ? (
              <div className="border rounded-lg p-6 bg-white">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">{selectedPlan.title}</h3>
                  <div className="flex items-center space-x-2">
                    <select
                      value={selectedPlan.status}
                      onChange={(e) => handleStatusChange(selectedPlan, e.target.value)}
                      className="text-sm border border-gray-300 rounded px-2 py-1"
                      disabled={updatePlanMutation.isPending}
                    >
                      <option value="accepted">Accepted</option>
                      <option value="implemented">Implemented</option>
                      <option value="archived">Archived</option>
                    </select>
                    <button
                      onClick={() => handleDelete(selectedPlan)}
                      className="text-red-500 hover:text-red-700 p-1"
                      disabled={deletePlanMutation.isPending}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="prose prose-sm max-w-none mb-4">
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 p-4 rounded border">
                    {selectedPlan.content}
                  </pre>
                </div>

                <div className="border-t pt-4 space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>Captured:</span>
                    <span>{formatDate(selectedPlan.capturedAt)}</span>
                  </div>
                  {selectedPlan.sessionId && (
                    <div className="flex justify-between">
                      <span>Session ID:</span>
                      <span className="font-mono text-xs">{selectedPlan.sessionId}</span>
                    </div>
                  )}
                  {selectedPlan.metadata && (
                    <div className="flex justify-between">
                      <span>Workspace:</span>
                      <span className="font-mono text-xs">
                        {(selectedPlan.metadata as any)?.cwd || 'Unknown'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="border rounded-lg p-6 bg-gray-50 text-center">
                <div className="text-gray-400 mb-2">
                  <svg className="mx-auto h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </div>
                <p className="text-gray-500">Select a plan to view details</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};