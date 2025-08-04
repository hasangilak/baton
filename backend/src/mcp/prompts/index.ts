import { PrismaClient } from '@prisma/client';
import { Prompt } from "@modelcontextprotocol/sdk/types.js";

export class BatonPromptProvider {
  constructor(private prisma: PrismaClient) {}

  async listPrompts(): Promise<Prompt[]> {
    return [
      {
        name: "create_project_plan",
        description: "Generate a comprehensive project plan with tasks and milestones",
        arguments: [
          {
            name: "project_name",
            description: "Name of the project to plan",
            required: true
          },
          {
            name: "project_description",
            description: "Description of the project goals and requirements",
            required: true
          },
          {
            name: "timeline",
            description: "Timeline for the project (e.g., '2 weeks', '1 month', '3 months')",
            required: false
          },
          {
            name: "team_size",
            description: "Number of team members working on the project",
            required: false
          },
          {
            name: "priority_level",
            description: "Overall priority level for the project (low, medium, high)",
            required: false
          }
        ]
      },
      {
        name: "analyze_project_status",
        description: "Analyze current project status and provide insights",
        arguments: [
          {
            name: "project_id",
            description: "ID of the project to analyze",
            required: true
          }
        ]
      },
      {
        name: "generate_task_breakdown",
        description: "Break down a complex task into smaller, manageable subtasks",
        arguments: [
          {
            name: "main_task",
            description: "Description of the main task to break down",
            required: true
          },
          {
            name: "complexity",
            description: "Complexity level of the task (simple, medium, complex)",
            required: false
          },
          {
            name: "skills_required",
            description: "Skills or expertise required for the task",
            required: false
          }
        ]
      },
      {
        name: "sprint_planning",
        description: "Generate a sprint plan based on project requirements",
        arguments: [
          {
            name: "project_id",
            description: "ID of the project for sprint planning",
            required: true
          },
          {
            name: "sprint_duration",
            description: "Duration of the sprint (e.g., '1 week', '2 weeks')",
            required: false
          },
          {
            name: "team_capacity",
            description: "Available team capacity for the sprint",
            required: false
          }
        ]
      },
      {
        name: "retrospective_analysis",
        description: "Generate retrospective questions and analysis for completed work",
        arguments: [
          {
            name: "project_id",
            description: "ID of the project to retrospect on",
            required: true
          },
          {
            name: "time_period",
            description: "Time period to analyze (e.g., 'last week', 'last month')",
            required: false
          }
        ]
      },
      {
        name: "risk_assessment",
        description: "Assess project risks and suggest mitigation strategies",
        arguments: [
          {
            name: "project_id",
            description: "ID of the project to assess",
            required: true
          }
        ]
      },
      {
        name: "standup_summary",
        description: "Generate a daily standup summary based on recent activity",
        arguments: [
          {
            name: "project_id",
            description: "ID of the project for standup summary",
            required: true
          },
          {
            name: "team_member",
            description: "Specific team member to focus on (optional)",
            required: false
          }
        ]
      },
      {
        name: "code_review_checklist",
        description: "Generate a code review checklist based on project requirements",
        arguments: [
          {
            name: "project_type",
            description: "Type of project (web, mobile, API, etc.)",
            required: true
          },
          {
            name: "technology_stack",
            description: "Technology stack being used",
            required: false
          }
        ]
      },
      {
        name: "detect_baton_project",
        description: "Guide user to find and read .baton-project configuration file",
        arguments: [
          {
            name: "search_path",
            description: "Starting directory to search for .baton-project file",
            required: false
          }
        ]
      },
      {
        name: "analyze_claude_plans",
        description: "Analyze captured Claude Code plans for insights and patterns",
        arguments: [
          {
            name: "project_id",
            description: "ID of the project to analyze plans for",
            required: true
          },
          {
            name: "time_period",
            description: "Time period to analyze (e.g., 'last week', 'last month')",
            required: false
          }
        ]
      },
      {
        name: "plan_implementation_guide",
        description: "Convert an accepted Claude Code plan into actionable task breakdown",
        arguments: [
          {
            name: "plan_id",
            description: "ID of the Claude Code plan to break down into tasks",
            required: true
          }
        ]
      },
      {
        name: "plan_retrospective",
        description: "Review effectiveness of captured Claude Code plans and their outcomes",
        arguments: [
          {
            name: "project_id",
            description: "ID of the project to analyze plan effectiveness for",
            required: true
          },
          {
            name: "plan_ids",
            description: "Specific plan IDs to focus on (optional, analyzes all if not provided)",
            required: false
          }
        ]
      }
    ];
  }

  async getPrompt(name: string, args?: any): Promise<{ messages: any[] }> {
    switch (name) {
      case "create_project_plan":
        return this.createProjectPlanPrompt(args);
      case "analyze_project_status":
        return this.analyzeProjectStatusPrompt(args);
      case "generate_task_breakdown":
        return this.generateTaskBreakdownPrompt(args);
      case "sprint_planning":
        return this.sprintPlanningPrompt(args);
      case "retrospective_analysis":
        return this.retrospectiveAnalysisPrompt(args);
      case "risk_assessment":
        return this.riskAssessmentPrompt(args);
      case "standup_summary":
        return this.standupSummaryPrompt(args);
      case "code_review_checklist":
        return this.codeReviewChecklistPrompt(args);
      case "detect_baton_project":
        return this.detectBatonProjectPrompt(args);
      case "analyze_claude_plans":
        return this.analyzeClaudePlansPrompt(args);
      case "plan_implementation_guide":
        return this.planImplementationGuidePrompt(args);
      case "plan_retrospective":
        return this.planRetrospectivePrompt(args);
      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  }

  private async createProjectPlanPrompt(args: any): Promise<{ messages: any[] }> {
    const { project_name, project_description, timeline = "4 weeks", team_size = "3-5", priority_level = "medium" } = args;

    return {
      messages: [
        {
          role: "system",
          content: `You are a senior project manager with expertise in agile methodologies and project planning. Create a comprehensive project plan that includes:

1. Project overview and objectives
2. Key milestones and deliverables
3. Task breakdown with priorities
4. Risk assessment and mitigation
5. Resource allocation recommendations
6. Success criteria and KPIs

Use your expertise to create actionable, realistic plans that can be implemented immediately in a task management system.`
        },
        {
          role: "user",
          content: `Create a detailed project plan for the following project:

**Project Name:** ${project_name}
**Description:** ${project_description}
**Timeline:** ${timeline}
**Team Size:** ${team_size} people
**Priority Level:** ${priority_level}

Please provide:
1. A structured breakdown of tasks and subtasks
2. Recommended priorities for each task (high/medium/low)
3. Estimated timeframes for completion
4. Dependencies between tasks
5. Key milestones and deadlines
6. Potential risks and mitigation strategies

Format the output so it can be easily converted into actionable tasks in a project management system.`
        }
      ]
    };
  }

  private async analyzeProjectStatusPrompt(args: any): Promise<{ messages: any[] }> {
    const { project_id } = args;

    // Fetch project data from database
    const project = await this.prisma.project.findUnique({
      where: { id: project_id },
      include: {
        tasks: {
          include: {
            assignee: {
              select: { id: true, name: true }
            }
          }
        },
        owner: {
          select: { id: true, name: true }
        }
      }
    });

    if (!project) {
      throw new Error(`Project with ID ${project_id} not found`);
    }

    const tasks = project.tasks;
    const completedTasks = tasks.filter(t => t.status === 'done');
    const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
    const todoTasks = tasks.filter(t => t.status === 'todo');

    return {
      messages: [
        {
          role: "system",
          content: `You are a data-driven project analyst with expertise in project health assessment and performance optimization. Analyze project data and provide actionable insights on:

1. Progress and completion rates
2. Task distribution and workload balance
3. Potential bottlenecks or risks
4. Team performance indicators
5. Timeline adherence
6. Recommendations for improvement

Focus on practical, actionable recommendations that can improve project outcomes.`
        },
        {
          role: "user",
          content: `Analyze the current status of this project and provide insights:

**Project:** ${project.name}
**Description:** ${project.description || 'No description provided'}
**Owner:** ${project.owner.name}

**Task Summary:**
- Total Tasks: ${tasks.length}
- Completed: ${completedTasks.length} (${tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0}%)
- In Progress: ${inProgressTasks.length}
- To Do: ${todoTasks.length}

**Task Details:**
${tasks.map(task => `
- ${task.title}
  Status: ${task.status}
  Priority: ${task.priority}
  Assignee: ${task.assignee?.name || 'Unassigned'}
  Created: ${task.createdAt.toDateString()}
  ${task.completedAt ? `Completed: ${task.completedAt.toDateString()}` : ''}
`).join('')}

Please provide:
1. Overall project health assessment
2. Progress analysis and trends
3. Identification of potential blockers or risks
4. Team workload analysis
5. Specific recommendations for improving project outcomes
6. Suggested next actions and priorities`
        }
      ]
    };
  }

  private async generateTaskBreakdownPrompt(args: any): Promise<{ messages: any[] }> {
    const { main_task, complexity = "medium", skills_required = "general development" } = args;

    return {
      messages: [
        {
          role: "system",
          content: `You are an experienced technical lead who excels at breaking down complex work into manageable, actionable tasks. Your goal is to create task breakdowns that:

1. Are specific and actionable
2. Have clear acceptance criteria
3. Can be estimated and tracked
4. Follow logical dependencies
5. Are appropriately sized for development teams

Focus on creating tasks that are neither too granular nor too broad, suitable for sprint planning and daily execution.`
        },
        {
          role: "user",
          content: `Break down this main task into smaller, manageable subtasks:

**Main Task:** ${main_task}
**Complexity:** ${complexity}
**Skills Required:** ${skills_required}

Please provide:
1. A list of 5-10 specific subtasks
2. Priority level for each subtask (high/medium/low)
3. Estimated complexity or size for each subtask
4. Dependencies between subtasks
5. Acceptance criteria for each subtask
6. Recommended order of execution

Format the breakdown so each subtask can be created as an individual task in a project management system.`
        }
      ]
    };
  }

  private async sprintPlanningPrompt(args: any): Promise<{ messages: any[] }> {
    const { project_id, sprint_duration = "2 weeks", team_capacity = "normal" } = args;

    // Fetch project data
    const project = await this.prisma.project.findUnique({
      where: { id: project_id },
      include: {
        tasks: {
          where: {
            status: { in: ['todo', 'in_progress'] }
          },
          orderBy: [
            { priority: 'desc' },
            { createdAt: 'asc' }
          ]
        }
      }
    });

    if (!project) {
      throw new Error(`Project with ID ${project_id} not found`);
    }

    return {
      messages: [
        {
          role: "system",
          content: `You are an agile coach and sprint planning expert. Create realistic, achievable sprint plans that:

1. Balance team capacity with project priorities
2. Consider task dependencies and complexity
3. Include buffer time for unknowns
4. Focus on delivering value incrementally
5. Set clear sprint goals and success criteria

Your recommendations should be practical and immediately actionable for development teams.`
        },
        {
          role: "user",
          content: `Plan a sprint for this project:

**Project:** ${project.name}
**Sprint Duration:** ${sprint_duration}
**Team Capacity:** ${team_capacity}

**Available Tasks:**
${project.tasks.map(task => `
- ${task.title}
  Priority: ${task.priority}
  Status: ${task.status}
  Description: ${task.description || 'No description'}
`).join('')}

Please provide:
1. Sprint goal and objectives
2. Recommended tasks to include in the sprint
3. Task prioritization and sequencing
4. Capacity planning and workload distribution
5. Definition of done for the sprint
6. Key risks and mitigation strategies
7. Success metrics for the sprint

Focus on creating a balanced, achievable sprint that delivers maximum value.`
        }
      ]
    };
  }

  private async retrospectiveAnalysisPrompt(args: any): Promise<{ messages: any[] }> {
    const { project_id, time_period = "last 2 weeks" } = args;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    if (time_period.includes('week')) {
      const weeks = parseInt(time_period.match(/\d+/)?.[0] || '2');
      startDate.setDate(endDate.getDate() - (weeks * 7));
    } else if (time_period.includes('month')) {
      const months = parseInt(time_period.match(/\d+/)?.[0] || '1');
      startDate.setMonth(endDate.getMonth() - months);
    }

    // Fetch project data for the time period
    const project = await this.prisma.project.findUnique({
      where: { id: project_id },
      include: {
        tasks: {
          where: {
            OR: [
              { createdAt: { gte: startDate, lte: endDate } },
              { updatedAt: { gte: startDate, lte: endDate } },
              { completedAt: { gte: startDate, lte: endDate } }
            ]
          },
          include: {
            assignee: {
              select: { name: true }
            }
          }
        }
      }
    });

    if (!project) {
      throw new Error(`Project with ID ${project_id} not found`);
    }

    const completedTasks = project.tasks.filter(t => 
      t.completedAt && t.completedAt >= startDate && t.completedAt <= endDate
    );

    return {
      messages: [
        {
          role: "system",
          content: `You are a skilled agile coach specializing in retrospective facilitation. Generate insightful retrospective analysis that helps teams:

1. Reflect on what went well and what didn't
2. Identify specific areas for improvement
3. Create actionable improvement plans
4. Celebrate successes and learn from challenges
5. Build team cohesion and continuous improvement culture

Focus on constructive, forward-looking insights that lead to concrete improvements.`
        },
        {
          role: "user",
          content: `Generate a retrospective analysis for this project:

**Project:** ${project.name}
**Time Period:** ${time_period}
**Period:** ${startDate.toDateString()} to ${endDate.toDateString()}

**Activity Summary:**
- Tasks worked on: ${project.tasks.length}
- Tasks completed: ${completedTasks.length}
- Completion rate: ${project.tasks.length > 0 ? Math.round((completedTasks.length / project.tasks.length) * 100) : 0}%

**Task Details:**
${project.tasks.map(task => `
- ${task.title}
  Status: ${task.status}
  Priority: ${task.priority}
  Assignee: ${task.assignee?.name || 'Unassigned'}
  ${task.completedAt ? `Completed: ${task.completedAt.toDateString()}` : 'Not completed'}
`).join('')}

Please provide:
1. What went well during this period
2. What challenges or blockers were encountered
3. Key learnings and insights
4. Specific areas for improvement
5. Action items for the next iteration
6. Process or workflow recommendations
7. Team performance observations

Structure this as a comprehensive retrospective that can guide future planning and improvements.`
        }
      ]
    };
  }

  private async riskAssessmentPrompt(args: any): Promise<{ messages: any[] }> {
    const { project_id } = args;

    const project = await this.prisma.project.findUnique({
      where: { id: project_id },
      include: {
        tasks: {
          include: {
            assignee: { select: { name: true } }
          }
        }
      }
    });

    if (!project) {
      throw new Error(`Project with ID ${project_id} not found`);
    }

    const overdueTasks = project.tasks.filter(task => 
      task.dueDate && task.dueDate < new Date() && task.status !== 'done'
    );

    const unassignedTasks = project.tasks.filter(task => !task.assigneeId);
    const highPriorityTasks = project.tasks.filter(task => task.priority === 'high' && task.status !== 'done');

    return {
      messages: [
        {
          role: "system",
          content: `You are a risk management expert with deep experience in project delivery. Analyze project data to identify potential risks and provide practical mitigation strategies. Focus on:

1. Technical risks and dependencies
2. Resource and capacity risks
3. Timeline and delivery risks
4. Quality and scope risks
5. Team and communication risks

Provide specific, actionable mitigation strategies that can be implemented immediately.`
        },
        {
          role: "user",
          content: `Assess the risks for this project:

**Project:** ${project.name}
**Total Tasks:** ${project.tasks.length}
**Overdue Tasks:** ${overdueTasks.length}
**Unassigned Tasks:** ${unassignedTasks.length}
**High Priority Incomplete Tasks:** ${highPriorityTasks.length}

**Project Status:**
${project.tasks.map(task => `
- ${task.title}
  Status: ${task.status}
  Priority: ${task.priority}
  Assignee: ${task.assignee?.name || 'UNASSIGNED'}
  Due Date: ${task.dueDate?.toDateString() || 'No due date'}
  ${task.dueDate && task.dueDate < new Date() && task.status !== 'done' ? '⚠️ OVERDUE' : ''}
`).join('')}

Please provide:
1. Comprehensive risk assessment with severity levels
2. Impact analysis for each identified risk
3. Probability assessment for each risk
4. Specific mitigation strategies for high-priority risks
5. Contingency plans for critical risks
6. Monitoring and early warning indicators
7. Recommendations for risk prevention

Focus on actionable recommendations that can be implemented to reduce project risk.`
        }
      ]
    };
  }

  private async standupSummaryPrompt(args: any): Promise<{ messages: any[] }> {
    const { project_id, team_member } = args;

    // Get recent activity (last 24 hours)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const project = await this.prisma.project.findUnique({
      where: { id: project_id },
      include: {
        tasks: {
          where: {
            updatedAt: { gte: yesterday }
          },
          include: {
            assignee: { select: { name: true } }
          }
        }
      }
    });

    if (!project) {
      throw new Error(`Project with ID ${project_id} not found`);
    }

    const recentlyUpdated = project.tasks.filter(task => task.updatedAt >= yesterday);
    const recentlyCompleted = recentlyUpdated.filter(task => task.status === 'done');

    return {
      messages: [
        {
          role: "system",
          content: `You are a scrum master facilitating daily standups. Generate concise, actionable standup summaries that help teams:

1. Share progress and accomplishments
2. Identify blockers and impediments
3. Align on daily priorities
4. Maintain team accountability
5. Foster collaboration and communication

Keep summaries focused, relevant, and time-efficient for daily team meetings.`
        },
        {
          role: "user",
          content: `Generate a daily standup summary for:

**Project:** ${project.name}
${team_member ? `**Focus:** ${team_member}` : '**Team-wide summary**'}

**Recent Activity (last 24 hours):**
- Tasks updated: ${recentlyUpdated.length}
- Tasks completed: ${recentlyCompleted.length}

**Task Updates:**
${recentlyUpdated.map(task => `
- ${task.title}
  Status: ${task.status}
  Assignee: ${task.assignee?.name || 'Unassigned'}
  Priority: ${task.priority}
`).join('')}

Please provide a standup-style summary including:
1. Yesterday's accomplishments
2. Today's planned work
3. Any blockers or impediments
4. Key priorities and focus areas
5. Collaboration needs or dependencies
6. Quick wins and progress highlights

Format as a brief, conversational summary suitable for a 10-minute standup meeting.`
        }
      ]
    };
  }

  private async codeReviewChecklistPrompt(args: any): Promise<{ messages: any[] }> {
    const { project_type, technology_stack = "general" } = args;

    return {
      messages: [
        {
          role: "system",
          content: `You are a senior software engineer and code review expert. Create comprehensive, practical code review checklists that ensure:

1. Code quality and maintainability
2. Security best practices
3. Performance optimization
4. Testing coverage
5. Documentation standards
6. Team coding standards compliance

Tailor recommendations to the specific technology stack and project type.`
        },
        {
          role: "user",
          content: `Create a comprehensive code review checklist for:

**Project Type:** ${project_type}
**Technology Stack:** ${technology_stack}

Please provide a detailed checklist covering:

1. **Code Quality**
   - Readability and maintainability
   - Naming conventions
   - Code structure and organization
   - Error handling

2. **Functionality**
   - Logic correctness
   - Edge case handling
   - Input validation
   - Output verification

3. **Performance**
   - Efficiency considerations
   - Resource usage
   - Optimization opportunities
   - Scalability factors

4. **Security**
   - Vulnerability assessment
   - Data protection
   - Access control
   - Input sanitization

5. **Testing**
   - Test coverage
   - Test quality
   - Integration testing
   - Edge case testing

6. **Documentation**
   - Code comments
   - API documentation
   - README updates
   - Change documentation

Format as a practical checklist that can be used during actual code reviews.`
        }
      ]
    };
  }

  private async detectBatonProjectPrompt(args: any): Promise<{ messages: any[] }> {
    const { search_path = "." } = args;

    return {
      messages: [
        {
          role: "system",
          content: `You are helping to detect the Baton project configuration. The user needs to find and read their .baton-project file to determine the correct project context for their workspace.

This is a critical step for ensuring that all tasks and todos are associated with the correct project in the Baton task management system.`
        },
        {
          role: "user",
          content: `I need to find the .baton-project configuration file in the current workspace to determine the project context.

Please help me by running these commands:

1. **Find the .baton-project file:**
   \`\`\`bash
   find ${search_path} -name '.baton-project' -type f | head -1
   \`\`\`

2. **Read the file contents:**
   After finding the file, please read its contents with:
   \`\`\`bash
   cat [FOUND_FILE_PATH]
   \`\`\`

3. **Extract the project ID:**
   The file should contain JSON like:
   \`\`\`json
   {"projectId": "cmdx0019o0001ijdvw3z1bbbi"}
   \`\`\`

Please execute these commands and return just the **projectId value** from the JSON file.

If no .baton-project file is found, please let me know so I can help you create one or associate this workspace with a Baton project.`
        }
      ]
    };
  }

  private async analyzeClaudePlansPrompt(args: any): Promise<{ messages: any[] }> {
    const { project_id, time_period = "last month" } = args;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    if (time_period.includes('week')) {
      const weeks = parseInt(time_period.match(/\d+/)?.[0] || '4');
      startDate.setDate(endDate.getDate() - (weeks * 7));
    } else if (time_period.includes('month')) {
      const months = parseInt(time_period.match(/\d+/)?.[0] || '1');
      startDate.setMonth(endDate.getMonth() - months);
    }

    // Fetch project and plans separately
    const project = await this.prisma.project.findUnique({
      where: { id: project_id }
    });

    if (!project) {
      throw new Error(`Project with ID ${project_id} not found`);
    }

    const plans = await this.prisma.claudeCodePlan.findMany({
      where: {
        projectId: project_id,
        capturedAt: { gte: startDate, lte: endDate }
      },
      orderBy: { capturedAt: 'desc' }
    });

    const acceptedPlans = plans.filter((p: any) => p.status === 'accepted');
    const implementedPlans = plans.filter((p: any) => p.status === 'implemented');
    const archivedPlans = plans.filter((p: any) => p.status === 'archived');

    return {
      messages: [
        {
          role: "system",
          content: `You are an AI planning expert who analyzes Claude Code plan patterns to provide actionable insights. Focus on:

1. Plan quality and clarity assessment
2. Implementation success patterns
3. Common planning themes and approaches
4. Planning frequency and consistency
5. Areas for planning improvement
6. Strategic planning recommendations

Provide specific, actionable insights that help improve future planning processes.`
        },
        {
          role: "user",
          content: `Analyze the Claude Code plans for this project:

**Project:** ${project.name}
**Time Period:** ${time_period}
**Analysis Period:** ${startDate.toDateString()} to ${endDate.toDateString()}

**Plan Summary:**
- Total Plans: ${plans.length}
- Accepted: ${acceptedPlans.length}
- Implemented: ${implementedPlans.length}
- Archived: ${archivedPlans.length}

**Plan Details:**
${plans.map((plan: any) => `
**Plan ID:** ${plan.id}
**Title:** ${plan.title}
**Status:** ${plan.status}
**Captured:** ${plan.capturedAt.toDateString()}
**Session:** ${plan.sessionId || 'Unknown'}

**Content Preview:**
${plan.content.substring(0, 300)}${plan.content.length > 300 ? '...' : ''}

**Metadata:**
${plan.metadata ? JSON.stringify(plan.metadata, null, 2) : 'No metadata'}
---
`).join('')}

Please provide:
1. Overall planning patterns and trends analysis
2. Plan quality assessment (clarity, specificity, actionability)
3. Implementation success rate analysis
4. Common themes and focus areas in plans
5. Planning frequency and consistency evaluation
6. Recommendations for improving plan quality
7. Strategic insights for better planning processes
8. Identification of most/least successful plan types

Focus on actionable insights that can improve future Claude Code planning sessions.`
        }
      ]
    };
  }

  private async planImplementationGuidePrompt(args: any): Promise<{ messages: any[] }> {
    const { plan_id } = args;

    // Fetch the specific Claude Code plan
    const plan = await this.prisma.claudeCodePlan.findUnique({
      where: { id: plan_id },
      include: {
        project: {
          select: { id: true, name: true }
        }
      }
    });

    if (!plan) {
      throw new Error(`Claude Code plan with ID ${plan_id} not found`);
    }

    return {
      messages: [
        {
          role: "system",
          content: `You are a technical project manager expert at converting high-level plans into specific, actionable task breakdowns. Your goal is to transform Claude Code plans into:

1. Concrete, implementable tasks
2. Clear acceptance criteria for each task
3. Appropriate task prioritization
4. Realistic time estimates
5. Task dependencies and sequencing
6. Risk assessment for complex tasks

Focus on creating task breakdowns that development teams can immediately execute.`
        },
        {
          role: "user",
          content: `Convert this Claude Code plan into a detailed task breakdown:

**Project:** ${plan.project.name}
**Plan Title:** ${plan.title}
**Plan Status:** ${plan.status}
**Captured:** ${plan.capturedAt.toDateString()}
**Session ID:** ${plan.sessionId || 'Unknown'}

**Plan Content:**
${plan.content}

**Plan Metadata:**
${plan.metadata ? JSON.stringify(plan.metadata, null, 2) : 'No additional metadata'}

Please provide:
1. **Task Breakdown Structure**
   - 8-15 specific, actionable tasks
   - Each task should be completable in 1-3 days
   - Clear, descriptive task titles

2. **Task Details** (for each task):
   - Detailed description and scope
   - Acceptance criteria (3-5 specific requirements)
   - Priority level (high/medium/low)
   - Estimated complexity/effort
   - Required skills or expertise
   - Dependencies on other tasks

3. **Implementation Strategy**
   - Recommended execution order
   - Critical path identification
   - Parallel work opportunities
   - Key milestones and checkpoints

4. **Risk Assessment**
   - Potential blockers or challenges
   - Mitigation strategies
   - Areas requiring additional research

5. **Success Metrics**
   - How to measure completion
   - Quality criteria
   - Definition of done

Format the output so each task can be directly created in a project management system like Baton.`
        }
      ]
    };
  }

  private async planRetrospectivePrompt(args: any): Promise<{ messages: any[] }> {
    const { project_id, plan_ids } = args;

    // Build where clause based on plan_ids filter
    const whereClause: any = { projectId: project_id };
    if (plan_ids && plan_ids.length > 0) {
      whereClause.id = { in: plan_ids };
    }

    // Fetch project, plans, and related tasks separately
    const project = await this.prisma.project.findUnique({
      where: { id: project_id }
    });

    if (!project) {
      throw new Error(`Project with ID ${project_id} not found`);
    }

    const plans = await this.prisma.claudeCodePlan.findMany({
      where: whereClause,
      orderBy: { capturedAt: 'desc' }
    });

    const planTasks = await this.prisma.task.findMany({
      where: {
        projectId: project_id,
        labels: { contains: 'claude-plan' }
      },
      include: {
        assignee: { select: { name: true } }
      }
    });

    return {
      messages: [
        {
          role: "system",
          content: `You are a retrospective facilitation expert specializing in AI-assisted planning analysis. Evaluate the effectiveness of Claude Code plans by analyzing:

1. Plan-to-execution translation success
2. Plan quality vs. actual outcomes
3. Planning process effectiveness
4. Areas where AI planning excelled or fell short
5. Lessons for improving AI-assisted planning
6. Strategic insights for better plan utilization

Provide constructive, forward-looking analysis that improves future planning collaboration between humans and AI.`
        },
        {
          role: "user",
          content: `Conduct a retrospective analysis of Claude Code plans and their outcomes:

**Project:** ${project.name}
**Plans Analyzed:** ${plans.length}
**Related Tasks:** ${planTasks.length}

**Plans Under Review:**
${plans.map((plan: any) => `
**Plan:** ${plan.title}
**Status:** ${plan.status}
**Captured:** ${plan.capturedAt.toDateString()}
**Content Length:** ${plan.content.length} characters
**Session:** ${plan.sessionId || 'Unknown'}

**Plan Summary:**
${plan.content.substring(0, 400)}${plan.content.length > 400 ? '...' : ''}
---
`).join('')}

**Associated Tasks:**
${planTasks.map((task: any) => `
- ${task.title}
  Status: ${task.status}
  Priority: ${task.priority}
  Assignee: ${task.assignee?.name || 'Unassigned'}
  Created: ${task.createdAt.toDateString()}
  ${task.completedAt ? `Completed: ${task.completedAt.toDateString()}` : 'Not completed'}
`).join('')}

Please provide a comprehensive retrospective analysis:

1. **Plan Effectiveness Assessment**
   - How well did plans translate to actual work?
   - Which plans were most/least successful?
   - Quality vs. execution correlation

2. **Planning Process Evaluation**
   - Strengths of the AI-assisted planning approach
   - Areas where human oversight was crucial
   - Gaps between planning and execution

3. **Outcome Analysis**
   - Successful plan implementations
   - Plans that didn't translate well to tasks
   - Unexpected outcomes or discoveries

4. **Lessons Learned**
   - What worked well in the planning process
   - What could be improved
   - Patterns in successful vs. unsuccessful plans

5. **Recommendations for Future Planning**
   - Process improvements
   - Plan quality enhancements
   - Better plan-to-task translation strategies
   - Collaboration improvements between AI and human planning

6. **Strategic Insights**
   - How AI planning fits into overall project management
   - Optimal use cases for Claude Code plan mode
   - Integration with traditional project management practices

Focus on actionable insights that will improve future AI-assisted planning sessions and project outcomes.`
        }
      ]
    };
  }
}