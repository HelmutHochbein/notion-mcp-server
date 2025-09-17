import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema, Tool } from '@modelcontextprotocol/sdk/types.js'
import { JSONSchema7 as IJsonSchema } from 'json-schema'
import { OpenAPIToMCPConverter } from '../openapi/parser'
import { HttpClient, HttpClientError } from '../client/http-client'
import { OpenAPIV3 } from 'openapi-types'
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'

type PathItemObject = OpenAPIV3.PathItemObject & {
  get?: OpenAPIV3.OperationObject
  put?: OpenAPIV3.OperationObject
  post?: OpenAPIV3.OperationObject
  delete?: OpenAPIV3.OperationObject
  patch?: OpenAPIV3.OperationObject
}

type NewToolDefinition = {
  methods: Array<{
    name: string
    description: string
    inputSchema: IJsonSchema & { type: 'object' }
    returnSchema?: IJsonSchema
  }>
}

/**
 * Entfernt „leere“ Werte aus Params, damit Notion-API keinen validation_error wirft
 * (z. B. start_cursor="" oder 0). Arbeitet rein mit `any`, damit TS strikt bleibt.
 */
function sanitizeParams(input: any): any {
  const isPlainObject = (v: any): v is Record<string, any> =>
    typeof v === 'object' && v !== null && !Array.isArray(v)

  const cursorKeyRegex = /(start_?cursor|next_?cursor|page_?cursor|cursor)$/i

  const shouldDrop = (key: string, val: any): boolean => {
    if (val === undefined || val === null) return true
    if (typeof val === 'string' && val.trim() === '') return true
    if (cursorKeyRegex.test(key)) {
      if (val === 0 || val === '0') return true
    }
    return false
  }

  const sanitizeArray = (arr: any[]): any[] =>
    arr
      .map((v) => (Array.isArray(v) ? sanitizeArray(v) : isPlainObject(v) ? sanitizeObject(v) : v))
      .filter((v) => !(v === undefined || v === null))

  const sanitizeObject = (obj: Record<string, any>): Record<string, any> => {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (shouldDrop(k, v)) continue
      if (Array.isArray(v)) {
        const cleaned = sanitizeArray(v)
        if (cleaned.length > 0) out[k] = cleaned
        continue
      }
      if (isPlainObject(v)) {
        const cleaned = sanitizeObject(v)
        if (Object.keys(cleaned).length > 0) out[k] = cleaned
        continue
      }
      out[k] = v
    }
    return out
  }

  if (Array.isArray(input)) return sanitizeArray(input)
  if (isPlainObject(input)) return sanitizeObject(input as Record<string, any>)
  return input
}

// import this class, extend and return server
export class MCPProxy {
  private server: Server
  private httpClient: HttpClient
  private tools: Record<string, NewToolDefinition>
  private openApiLookup: Record<string, OpenAPIV3.OperationObject & { method: string; path: string }>

  constructor(name: string, openApiSpec: OpenAPIV3.Document) {
    this.server = new Server({ name, version: '1.0.0' }, { capabilities: { tools: {} } })
    const baseUrl = openApiSpec.servers?.[0].url
    if (!baseUrl) {
      throw new Error('No base URL found in OpenAPI spec')
    }
    this.httpClient = new HttpClient(
      {
        baseUrl,
        headers: this.parseHeadersFromEnv(),
      },
      openApiSpec,
    )

    // Convert OpenAPI spec to MCP tools
    const converter = new OpenAPIToMCPConverter(openApiSpec)
    const { tools, openApiLookup } = converter.convertToMCPTools()
    this.tools = tools
    this.openApiLookup = openApiLookup

    this.setupHandlers()
  }

  private setupHandlers() {
    // Handle tool listing
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = []

      // Add methods as separate tools to match the MCP format
      Object.entries(this.tools).forEach(([toolName, def]) => {
        def.methods.forEach(method => {
          const toolNameWithMethod = `${toolName}-${method.name}`
          const truncatedToolName = this.truncateToolName(toolNameWithMethod)
          tools.push({
            name: truncatedToolName,
            description: method.description,
            inputSchema: method.inputSchema as Tool['inputSchema'],
          })
        })
      })

      return { tools }
    })

    // Handle tool calling
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: params } = request.params

      // Find the operation in OpenAPI spec
      const operation = this.findOperation(name)
      if (!operation) {
        throw new Error(`Method ${name} not found`)
      }

      try {
        // WICHTIG: Parameter vor der Anfrage bereinigen (leere/unerlaubte Query-Keys)
        const cleanedParams = sanitizeParams(params as any)

        // Execute the operation
        const response = await this.httpClient.executeOperation(operation, cleanedParams)

        // Convert response to MCP format
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response.data),
            },
          ],
        }
      } catch (error) {
        console.error('Error in tool call', error)
        if (error instanceof HttpClientError) {
          console.error('HttpClientError encountered, returning structured error', error)
          const data = (error as any).data?.response?.data ?? (error as any).data ?? {}
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  status: 'error',
                  ...(typeof data === 'object' ? data : { data: data }),
                }),
              },
            ],
          }
        }
        throw error
      }
    })
  }

  private findOperation(operationId: string): (OpenAPIV3.OperationObject & { method: string; path: string }) | null {
    return this.openApiLookup[operationId] ?? null
  }

  private parseHeadersFromEnv(): Record<string, string> {
    // First try OPENAPI_MCP_HEADERS (existing behavior)
    const headersJson = process.env.OPENAPI_MCP_HEADERS
    if (headersJson) {
      try {
        const headers = JSON.parse(headersJson)
        if (typeof headers !== 'object' || headers === null) {
          console.warn('OPENAPI_MCP_HEADERS environment variable must be a JSON object, got:', typeof headers)
        } else if (Object.keys(headers).length > 0) {
          // Only use OPENAPI_MCP_HEADERS if it contains actual headers
          return headers as Record<string, string>
        }
        // If OPENAPI_MCP_HEADERS is empty object, fall through to try NOTION_TOKEN
      } catch (error) {
        console.warn('Failed to parse OPENAPI_MCP_HEADERS environment variable:', error)
        // Fall through to try NOTION_TOKEN
      }
    }

    // Alternative: try NOTION_TOKEN
    const notionToken = process.env.NOTION_TOKEN
    if (notionToken) {
      return {
        'Authorization': `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28'
      }
    }

    return {}
  }

  private getContentType(headers: Headers): 'text' | 'image' | 'binary' {
    const contentType = headers.get('content-type')
    if (!contentType) return 'binary'

    if (contentType.includes('text') || contentType.includes('json')) {
      return 'text'
    } else if (contentType.includes('image')) {
      return 'image'
    }
    return 'binary'
  }

  private truncateToolName(name: string): string {
    if (name.length <= 64) {
      return name
    }
    return name.slice(0, 64)
  }

  async connect(transport: Transport) {
    await this.server.connect(transport)
  }

  getServer() {
    return this.server
  }
}
