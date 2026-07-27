export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
}

export interface ApiError {
  success: false;
  message: string;
  errors?: string[];
}
