/**
 * Configuration interface for resource generator strategy.
 *
 * @public
 */
export interface IResourceGeneratorStrategyConfig {

    // #region Properties

    /**
     * The API key used for authentication.
     */
    apiKey: string;

    /**
     * The model to be used for generation.
     */
    model: string;

    /**
     * The temperature setting for the generation process.
     */
    temperature: number;

    /**
     * Additional instructions to guide the generation process.
     */
    instructions: string | Array<string>;

    /**
     * Another address of the provider, such as a proxy of a company. By default the provider's own.
     */
    baseUrl?: string;

    // #endregion

}
