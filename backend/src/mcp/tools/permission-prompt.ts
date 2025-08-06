/**
 * Advanced MCP Permission Prompt Tool
 * Handles Claude Code permission delegation with sophisticated 3-option prompts
 */

import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schema for permission prompt requests
const PermissionPromptSchema = z.object({
  action: z.string().describe('The action Claude wants to perform'),
  resource: z.string().optional().describe('The resource being acted upon (file path, command, etc.)'),
  tool: z.string().describe('The tool Claude wants to use'),
  context: z.object({
    projectId: z.string().optional(),
    conversationId: z.string().optional(),
    sessionId: z.string().optional(),
    workingDirectory: z.string().optional(),
    message: z.string().optional()
  }).optional().describe('Additional context for the permission request'),
  danger_level: z.enum(['safe', 'moderate', 'dangerous']).optional().describe('Risk assessment of the action'),
  auto_approve: z.boolean().optional().describe('Whether to auto-approve based on allowlist')
});

type PermissionPromptArgs = z.infer<typeof PermissionPromptSchema>;

interface PermissionPromptResponse {
  approved: boolean;
  response: 'yes' | 'no' | 'yes_dont_ask';
  remember: boolean;
  reason?: string;
}

export async function handlePermissionPrompt(args: PermissionPromptArgs, context?: any): Promise<any> {
    const {
      action,
      resource,
      tool,
      context: promptContext,
      danger_level = 'moderate',
      auto_approve = false
    } = args;

    // Get project context if available
    const projectContext = context.projectContext;
    const projectId = promptContext?.projectId || projectContext?.id;
    const sessionId = promptContext?.sessionId || context.sessionId;
    const conversationId = promptContext?.conversationId;

    console.log(`🔐 MCP Permission Prompt: ${tool} wants to ${action}${resource ? ` on ${resource}` : ''}`);

    // Check if this action should be auto-approved based on existing rules
    if (auto_approve || await shouldAutoApprove(tool, action, resource, projectId)) {
      console.log(`✅ Auto-approved: ${action}`);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            approved: true,
            response: 'yes',
            remember: false,
            reason: 'Auto-approved by allowlist rules'
          })
        }]
      };
    }

    // Check if this action should be auto-denied
    if (await shouldAutoDeny(tool, action, resource)) {
      console.log(`❌ Auto-denied: ${action}`);
      return {
        content: [{
          type: 'text', 
          text: JSON.stringify({
            approved: false,
            response: 'no',
            remember: false,
            reason: 'Auto-denied by denylist rules'
          })
        }]
      };
    }

    // Create sophisticated prompt with 3 options
    const prompt = await createAdvancedPrompt({
      tool,
      action,
      resource,
      danger_level,
      projectId,
      sessionId,
      conversationId,
      context: promptContext
    });

    // Store prompt in database for UI handling
    const interactivePrompt = await prisma.interactivePrompt.create({
      data: {
        conversationId: conversationId || 'mcp-permission-request',
        sessionId: sessionId || null,
        type: 'mcp_permission',
        title: prompt.title,
        message: prompt.message,
        options: prompt.options,
        context: {
          tool,
          action,
          resource,
          danger_level,
          projectId,
          workingDirectory: promptContext?.workingDirectory,
          originalMessage: promptContext?.message
        },
        status: 'pending',
        timeoutAt: new Date(Date.now() + 300000), // 5 minute timeout for MCP prompts
      }
    });

    // Emit to frontend via WebSocket (if available)
    // Note: In production, this would use the Socket.IO instance
    console.log(`📡 Would emit MCP permission prompt: ${interactivePrompt.id}`);

    console.log(`📡 MCP Permission prompt emitted: ${interactivePrompt.id}`);

    // Wait for user response (implement polling or callback mechanism)
    const response = await waitForUserResponse(interactivePrompt.id);

    // Update prompt status
    await prisma.interactivePrompt.update({
      where: { id: interactivePrompt.id },
      data: {
        status: 'answered',
        selectedOption: response.response,
        respondedAt: new Date()
      }
    });

    // Store decision for future reference if "don't ask again" was selected
    if (response.remember) {
      await storePermissionDecision(tool, action, resource, response.approved, projectId);
    }

    console.log(`🎯 MCP Permission response: ${response.approved ? 'APPROVED' : 'DENIED'}`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response)
      }]
    };
}

async function shouldAutoApprove(tool: string, action: string, resource?: string, projectId?: string): Promise<boolean> {
  // Check allowlist rules from database
  const allowRules = await prisma.$queryRaw<Array<{tool: string, action: string, resource: string}>>`
    SELECT tool, action, resource FROM permission_rules 
    WHERE type = 'allow' AND (project_id = ${projectId} OR project_id IS NULL)
  `;

  for (const rule of allowRules) {
    if (matchesRule(tool, action, resource, rule)) {
      return true;
    }
  }

  // Built-in safe operations
  const safeCombinations = [
    { tool: 'Read', action: 'read' },
    { tool: 'LS', action: 'list' },
    { tool: 'Grep', action: 'search' },
    { tool: 'Glob', action: 'search' },
    { tool: 'WebFetch', action: 'fetch' },
    { tool: 'WebSearch', action: 'search' }
  ];

  return safeCombinations.some(safe => 
    tool.includes(safe.tool) && action.includes(safe.action)
  ) || false;
}

async function shouldAutoDeny(tool: string, action: string, resource?: string): Promise<boolean> {
  const dangerousPatterns = [
    /rm.*-rf/i,
    /sudo/i,
    /format/i,
    /delete.*system/i,
    /drop.*table/i,
    /truncate/i
  ];

  const fullAction = `${tool} ${action} ${resource || ''}`;
  return dangerousPatterns.some(pattern => pattern.test(fullAction));
}

function matchesRule(tool: string, action: string, resource: string | undefined, rule: {tool: string, action: string, resource: string}): boolean {
  const toolMatch = rule.tool === '*' || tool.includes(rule.tool);
  const actionMatch = rule.action === '*' || action.includes(rule.action);
  const resourceMatch = !rule.resource || rule.resource === '*' || (resource ? resource.includes(rule.resource) : false);
  
  return Boolean(toolMatch && actionMatch && resourceMatch);
}

async function createAdvancedPrompt(params: {
  tool: string;
  action: string;
  resource: string | undefined;
  danger_level: string;
  projectId: string | undefined;
  sessionId: string | undefined;
  conversationId: string | undefined;
  context: any;
}) {
  const { tool, action, resource, danger_level } = params;
  
  // Create contextual title
  let title = 'Permission Request';
  if (danger_level === 'dangerous') {
    title = '⚠️ Dangerous Operation - Permission Required';
  } else if (danger_level === 'moderate') {
    title = '🔐 Permission Required';
  } else {
    title = 'ℹ️ Confirm Action';
  }

  // Create detailed message
  let message = `Claude wants to use **${tool}** to ${action}`;
  if (resource) {
    message += ` on \`${resource}\``;
  }
  
  // Add context if available
  if (params.context?.workingDirectory) {
    message += `\n\n**Working Directory:** \`${params.context.workingDirectory}\``;
  }
  
  if (params.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: { name: true }
    });
    if (project) {
      message += `\n**Project:** ${project.name}`;
    }
  }

  // Risk assessment
  const riskMessages = {
    safe: 'This operation is considered safe.',
    moderate: 'This operation may modify files or system state.',
    dangerous: '⚠️ **This operation could cause data loss or system damage.**'
  };
  
  message += `\n\n${riskMessages[danger_level as keyof typeof riskMessages]}`;

  // Create 3-option structure
  const options = [
    {
      id: '1',
      label: 'Yes',
      value: 'yes',
      description: 'Allow this operation once',
      isDefault: danger_level === 'safe',
      isRecommended: danger_level !== 'dangerous'
    },
    {
      id: '2', 
      label: 'No',
      value: 'no',
      description: 'Deny this operation',
      isDefault: false,
      isRecommended: danger_level === 'dangerous'
    },
    {
      id: '3',
      label: "Yes, don't ask again",
      value: 'yes_dont_ask',
      description: `Always allow ${tool} to ${action}${resource ? ` on files like ${resource}` : ''}`,
      isDefault: false,
      isRecommended: danger_level === 'safe'
    }
  ];

  return { title, message, options };
}

async function waitForUserResponse(promptId: string, timeoutMs: number = 300000): Promise<PermissionPromptResponse> {
  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Permission prompt timed out'));
    }, timeoutMs);

    // Poll for response every 1 second
    const pollInterval = setInterval(async () => {
      try {
        const prompt = await prisma.interactivePrompt.findUnique({
          where: { id: promptId }
        });

        if (prompt && prompt.status === 'answered' && prompt.selectedOption) {
          clearTimeout(timeout);
          clearInterval(pollInterval);

          const approved = prompt.selectedOption === '1' || prompt.selectedOption === '3';
          const remember = prompt.selectedOption === '3';
          
          const response: PermissionPromptResponse = {
            approved: approved,
            response: prompt.selectedOption === '1' ? 'yes' : 
                     prompt.selectedOption === '3' ? 'yes_dont_ask' : 'no',
            remember: remember,
            reason: prompt.selectedOption === '1' ? 'User approved' :
                   prompt.selectedOption === '3' ? 'User approved with remember' : 'User denied'
          };

          resolve(response);
        }
      } catch (error) {
        clearTimeout(timeout);
        clearInterval(pollInterval);
        reject(error);
      }
    }, 1000);
  });
}

async function storePermissionDecision(
  tool: string,
  action: string,
  resource: string | undefined,
  approved: boolean,
  projectId?: string
): Promise<void> {
  // Create or update permission rule
  await prisma.$executeRaw`
    INSERT INTO permission_rules (tool, action, resource, type, project_id, created_at)
    VALUES (${tool}, ${action}, ${resource || '*'}, ${approved ? 'allow' : 'deny'}, ${projectId}, NOW())
    ON CONFLICT (tool, action, resource, project_id) 
    DO UPDATE SET type = ${approved ? 'allow' : 'deny'}, updated_at = NOW()
  `;

  console.log(`💾 Stored permission decision: ${tool}/${action} = ${approved ? 'ALLOW' : 'DENY'}`);
}