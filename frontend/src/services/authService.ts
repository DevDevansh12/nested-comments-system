import { apiService } from './api';
import { RegisterDto, LoginDto, AuthTokenResponse, IUserPublic } from '@/types/user';

export const authService = {
  async register(data: RegisterDto): Promise<AuthTokenResponse> {
    const response = await apiService.post<AuthTokenResponse>('/auth/register', data);
    if (response.success && response.data) {
      // Store token and user in localStorage
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      return response.data;
    }
    throw new Error(response.message || 'Registration failed');
  },

  async login(data: LoginDto): Promise<AuthTokenResponse> {
    const response = await apiService.post<AuthTokenResponse>('/auth/login', data);
    if (response.success && response.data) {
      // Store token and user in localStorage
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      return response.data;
    }
    throw new Error(response.message || 'Login failed');
  },

  async getMe(): Promise<IUserPublic> {
    const response = await apiService.get<IUserPublic>('/auth/me');
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.message || 'Failed to get user');
  },

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  getStoredUser(): IUserPublic | null {
    if (typeof window === 'undefined') return null;
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  },

  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('token');
  },

  isAuthenticated(): boolean {
    return !!this.getToken();
  },
};
