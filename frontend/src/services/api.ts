import type { 
  ApiResponse, 
  Project, 
  Task, 
  MCPPlan, 
  MCPAgent, 
  CreateProjectRequest, 
  UpdateProjectRequest,
  CreateTaskRequest,
  UpdateTaskRequest 
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

class ApiService {
  private async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const config: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Request failed');
      }

      return data;
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // Projects
  async getProjects(): Promise<ApiResponse<Project[]>> {
    return this.request<Project[]>('/api/projects');
  }

  async getProject(id: string): Promise<ApiResponse<Project>> {
    return this.request<Project>(`/api/projects/${id}`);
  }

  async createProject(data: CreateProjectRequest): Promise<ApiResponse<Project>> {
    return this.request<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProject(id: string, data: UpdateProjectRequest): Promise<ApiResponse<Project>> {
    return this.request<Project>(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteProject(id: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/projects/${id}`, {
      method: 'DELETE',
    });
  }

  // Tasks
  async getTasks(projectId: string, status?: string): Promise<ApiResponse<Task[]>> {
    const params = new URLSearchParams({ projectId });
    if (status) params.append('status', status);
    
    return this.request<Task[]>(`/api/tasks?${params.toString()}`);
  }

  async getTask(id: string): Promise<ApiResponse<Task>> {
    return this.request<Task>(`/api/tasks/${id}`);
  }

  async createTask(data: CreateTaskRequest): Promise<ApiResponse<Task>> {
    return this.request<Task>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTask(id: string, data: UpdateTaskRequest): Promise<ApiResponse<Task>> {
    return this.request<Task>(`/api/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteTask(id: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/tasks/${id}`, {
      method: 'DELETE',
    });
  }

  async reorderTask(
    id: string, 
    newStatus: string, 
    newOrder: number, 
    projectId: string
  ): Promise<ApiResponse<Task>> {
    return this.request<Task>(`/api/tasks/${id}/reorder`, {
      method: 'POST',
      body: JSON.stringify({ newStatus, newOrder, projectId }),
    });
  }

  // MCP Agents
  async getMCPAgents(): Promise<ApiResponse<MCPAgent[]>> {
    return this.request<MCPAgent[]>('/api/mcp/agents');
  }

  async registerMCPAgent(data: { 
    name: string; 
    description?: string; 
    endpoint: string 
  }): Promise<ApiResponse<MCPAgent>> {
    return this.request<MCPAgent>('/api/mcp/agents', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // MCP Plans
  async getMCPPlans(projectId?: string, agentId?: string): Promise<ApiResponse<MCPPlan[]>> {
    const params = new URLSearchParams();
    if (projectId) params.append('projectId', projectId);
    if (agentId) params.append('agentId', agentId);
    
    const query = params.toString();
    return this.request<MCPPlan[]>(`/api/mcp/plans${query ? `?${query}` : ''}`);
  }

  async getMCPPlan(id: string): Promise<ApiResponse<MCPPlan>> {
    return this.request<MCPPlan>(`/api/mcp/plans/${id}`);
  }

  async createMCPPlan(data: {
    title: string;
    description?: string;
    agentName: string;
    projectId: string;
    tasks: Array<{
      title: string;
      description?: string;
      priority?: string;
      order?: number;
    }>;
  }): Promise<ApiResponse<MCPPlan>> {
    return this.request<MCPPlan>('/api/mcp/plans', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateMCPPlan(id: string, data: {
    title?: string;
    description?: string;
    status?: string;
  }): Promise<ApiResponse<MCPPlan>> {
    return this.request<MCPPlan>(`/api/mcp/plans/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async convertMCPPlan(id: string): Promise<ApiResponse<{ tasks: Task[] }>> {
    return this.request<{ tasks: Task[] }>(`/api/mcp/plans/${id}/convert`, {
      method: 'POST',
    });
  }

  async deleteMCPPlan(id: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/mcp/plans/${id}`, {
      method: 'DELETE',
    });
  }
}

export const apiService = new ApiService();