import { Injectable, BadRequestException } from '@nestjs/common';
import { BusinessesService } from '../businesses/businesses.service';

/**
 * Server-side helper that loads and decrypts the business's Claude API key.
 * Used by any module that needs to call the Anthropic API.
 * The key is NEVER sent to the frontend.
 */
@Injectable()
export class ClaudeKeyService {
  constructor(private readonly businessesService: BusinessesService) {}

  /**
   * Returns the decrypted Claude API key for the given business.
   * Throws 400 if no key has been configured yet.
   */
  async getKey(businessId: string): Promise<string> {
    const key = await this.businessesService.getDecryptedClaudeApiKey(businessId);
    if (!key) {
      throw new BadRequestException(
        'No Claude API key is configured. The owner must add one in AI Settings.',
      );
    }
    return key;
  }
}
