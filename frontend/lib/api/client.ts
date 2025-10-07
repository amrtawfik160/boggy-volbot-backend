import { toast } from 'sonner';
import { createClient } from '../supabase/client';

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: Record<string, unknown>;
}

export interface RequestInterceptor {
  onRequest?: (url: string, options: RequestInit) => Promise<RequestInit> | RequestInit;
  onResponse?: (response: Response) => Promise<Response> | Response;
  onError?: (error: ApiError) => void;
}

export class ApiClient {
  private baseUrl: string;
  private supabase = createClient();
  private interceptors: RequestInterceptor[] = [];

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    this.setupDefaultInterceptors();
  }

  private setupDefaultInterceptors() {
    // Error handling interceptor
    this.addInterceptor({
      onError: (error: ApiError) => {
        const message = error.message || 'An unexpected error occurred';

        // Handle specific status codes
        switch (error.status) {
          case 401:
            toast.error('Session expired. Please login again.');
            break;
          case 403:
            toast.error('You do not have permission to perform this action.');
            break;
          case 404:
            toast.error('Resource not found.');
            break;
          case 500:
            toast.error('Server error. Please try again later.');
            break;
          default:
            if (error.status && error.status >= 400) {
              toast.error(message);
            }
        }
      },
    });
  }

  addInterceptor(interceptor: RequestInterceptor) {
    this.interceptors.push(interceptor);
  }

  private async getAuthHeaders(): Promise<HeadersInit> {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Not authenticated');
    }

    return {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    };
  }

  private async executeRequest<T>(
    path: string,
    method: string,
    data?: unknown
  ): Promise<T> {
    try {
      const headers = await this.getAuthHeaders();
      let options: RequestInit = {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
      };

      // Apply request interceptors
      for (const interceptor of this.interceptors) {
        if (interceptor.onRequest) {
          options = await interceptor.onRequest(`${this.baseUrl}${path}`, options);
        }
      }

      let response = await fetch(`${this.baseUrl}${path}`, options);

      // Apply response interceptors
      for (const interceptor of this.interceptors) {
        if (interceptor.onResponse) {
          response = await interceptor.onResponse(response);
        }
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Request failed' }));
        const error: ApiError = {
          message: errorData.message || errorData.error || `HTTP ${response.status}`,
          code: errorData.code,
          status: response.status,
          details: errorData.details,
        };

        // Notify error interceptors
        for (const interceptor of this.interceptors) {
          if (interceptor.onError) {
            interceptor.onError(error);
          }
        }

        throw error;
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return {} as T;
      }

      return response.json();
    } catch (error) {
      // Handle network errors or other unexpected errors
      if (error instanceof Error && !('status' in error)) {
        const apiError: ApiError = {
          message: error.message || 'Network error occurred',
          status: 0,
        };

        for (const interceptor of this.interceptors) {
          if (interceptor.onError) {
            interceptor.onError(apiError);
          }
        }
      }
      throw error;
    }
  }

  async get<T>(path: string): Promise<T> {
    return this.executeRequest<T>(path, 'GET');
  }

  async post<T>(path: string, data?: unknown): Promise<T> {
    return this.executeRequest<T>(path, 'POST', data);
  }

  async patch<T>(path: string, data: unknown): Promise<T> {
    return this.executeRequest<T>(path, 'PATCH', data);
  }

  async delete<T>(path: string): Promise<T> {
    return this.executeRequest<T>(path, 'DELETE');
  }

  async put<T>(path: string, data: unknown): Promise<T> {
    return this.executeRequest<T>(path, 'PUT', data);
  }
}

export const apiClient = new ApiClient();

