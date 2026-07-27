export interface IUser {
  _id: string;
  username: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface IUserPublic {
  _id: string;
  username: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterDto {
  username: string;
  email: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthTokenResponse {
  user: IUserPublic;
  token: string;
}
