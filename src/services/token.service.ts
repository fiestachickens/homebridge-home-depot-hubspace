import axios from 'axios';
import { Endpoints } from '../api/endpoints';
import { TokenResponse } from '../responses/token-response';

/**
 * Service for managing JWT tokens
 */
class TokenService {
    public loginBuffer: number = 60;
    private _refreshInterval?: NodeJS.Timeout;
    private readonly _httpClient = axios.create({ baseURL: Endpoints.ACCOUNT_BASE_URL });

    private _accessToken?: string;
    private _accessTokenExpiration?: Date;
    private _refreshToken?: string;
    private _refreshTokenExpiration?: Date;
    private _username: string = '';
    private _password: string = '';
    private _authenticatingPromise?: Promise<boolean>;

    /**
     * Creates a new instance of token service
     */
    constructor() { }

    /**
     * Initializes {@link TokenService}
     * @param username Account username
     * @param password Account password
     */
    public login(username: string, password: string): void {
        this._username = username;
        this._password = password;
    }

    public async getToken(): Promise<string | undefined> {
        if (!this.hasValidToken()) {
            await this.authenticate();  // will deduplicate automatically now
        }

        return this._accessToken;
    }

    public hasValidToken(): boolean {
        return this._accessToken !== undefined && !this.isAccessTokenExpired();
    }

    private startAutoRefresh(): void {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
        }

        this._refreshInterval = setInterval(async () => {
            const bufferTime = this.loginBuffer * 1000; // minutes before expiration
            const now = new Date().getTime();
            const exp = this._refreshTokenExpiration?.getTime() ?? 0;

            if (exp - now < bufferTime) {
                await this.authenticate();
            }
        }, 30 * 1000); // check every 30 seconds
    }

    private async authenticate(): Promise<boolean> {
        if (this._authenticatingPromise) {
            // If already authenticating, reuse it
            return this._authenticatingPromise;
        }

        this._authenticatingPromise = (async () => {
            if (!this.isAccessTokenExpired() && !this.isRefreshTokenExpired()) return true;
            const tokenResponse = await this.getTokenFromRefreshToken() || await this.getTokenFromCredentials();
            this.setTokens(tokenResponse);
            return !!tokenResponse;
        })();

        try {
            return await this._authenticatingPromise;
        } finally {
            this._authenticatingPromise = undefined;  // clear once finished
        }
    }

    private async getTokenFromRefreshToken(): Promise<TokenResponse | undefined> {
        // If refresh token is expired then don't even try...
        if (this.isRefreshTokenExpired()) return undefined;

        const params = new URLSearchParams();

        params.append('grant_type', 'refresh_token');
        params.append('client_id', 'hubspace_android');
        params.append('refresh_token', this._refreshToken!);

        try {
            const response = await this._httpClient.post('/protocol/openid-connect/token', params);
            return response.status === 200 ? response.data : undefined;
        } catch {
            return undefined;
        }
    }

    private async getTokenFromCredentials(): Promise<TokenResponse | undefined> {
        const params = new URLSearchParams();

        params.append('grant_type', 'password');
        params.append('client_id', 'hubspace_android');
        params.append('username', this._username);
        params.append('password', this._password);

        try {
            const response = await this._httpClient.post('/protocol/openid-connect/token', params);

            return response.status === 200 ? response.data : undefined;
        } catch {
            return undefined;
        }
    }


    /**
     * Sets tokens to new values
     * @param response Response with tokens
     */
    private setTokens(response?: TokenResponse): void {
        if (!response) {
            this.clearTokens();
            return;
        }

        this._accessToken = response.access_token;
        this._refreshToken = response.refresh_token;

        const currentDate = new Date();

        this._accessTokenExpiration = new Date(currentDate.getTime() + response.expires_in * 1000);
        this._refreshTokenExpiration = new Date(currentDate.getTime() + response.refresh_expires_in * 1000);

        this.startAutoRefresh();
    }


    /**
     * Clears stored tokens
     */
    private clearTokens(): void {
        this._accessToken = undefined;
        this._refreshToken = undefined;
        this._accessTokenExpiration = undefined;
        this._refreshTokenExpiration = undefined;

        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
            this._refreshInterval = undefined;
        }
    }

    /**
     * Checks whether the access token is expired
     * @returns True if access token is expired otherwise false
     */
    private isAccessTokenExpired(): boolean {
        return !this._accessTokenExpiration || this._accessTokenExpiration < new Date();
    }

    /**
     * Checks whether the refresh token is expired
     * @returns True if refresh token is expired otherwise false
     */
    private isRefreshTokenExpired(): boolean {
        return !this._refreshTokenExpiration || this._refreshTokenExpiration < new Date();
    }

}

export const tokenService: TokenService = new TokenService();