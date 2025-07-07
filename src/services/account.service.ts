import { AxiosError } from 'axios';
import { Logger } from 'homebridge';
import { Endpoints } from '../api/endpoints';
import { createHttpClientWithBearerInterceptor } from '../api/http-client-factory';
import { AccountResponse } from '../responses/account-response';

/**
 * Service for managing account details
 */
export class AccountService {
    private readonly _client = createHttpClientWithBearerInterceptor({
        baseURL: Endpoints.API_BASE_URL
    });

    private _onAccountLoaded?: () => void | Promise<void>;

    constructor(private readonly _log: Logger) { }

    private _accountId = '';

    /**
     * Gets the account ID
     */
    public get accountId(): string {
        return this._accountId;
    }

    public onAccountLoaded(callback: () => Promise<void>) {
        this._onAccountLoaded = callback;
    }

    /**
     * Loads current user account
     * @returns True if load succeeded otherwise false
     */
    public async loadAccount(): Promise<void> {
        try {
            const response = await this._client.get<AccountResponse>('/users/me');

            this._accountId = response.data.accountAccess[0].account.accountId;

            if (this._onAccountLoaded) {
                this._onAccountLoaded();
            }
        } catch (ex) {
            const axiosError = <AxiosError>ex;
            const friendlyMessage = axiosError.response?.status === 401 ? 'Incorrect username or password' : axiosError.message;

            this._log.error('Failed to load account information.', friendlyMessage);
        }
    }

}