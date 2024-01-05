/*
 * Copyright 2024 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

/**
 * @typedef {object} AwsBedrockMiddlewareResponse
 * @property {object} response Has a `body` property that is an IncomingMessage,
 * a `headers` property that are the response headers, a `reason` property that
 * indicates the status code reason, and a `statusCode` property.
 * @property {object} output Has a `$metadata` property that includes the
 * `requestId`, and a `body` property that is a Uint8Array representation
 * of the response payload.
 */

/**
 * Represents a response from the Bedrock API. Given that the API response
 * has as many different shapes as the number of models it supports, and the
 * fact that responses require byte array processing, this object provides
 * an abstraction that normalizes responses into a known interface and
 * simplifies accessing desired fields.
 */
class BedrockResponse {
  #innerResponse
  #innerOutput
  #parsedBody
  #command
  #completions = []
  #id

  /**
   * @param {object} params
   * @param {AwsBedrockMiddlewareResponse} params.response
   * @param {BedrockCommand} params.bedrockCommand
   */
  constructor({ response, bedrockCommand }) {
    this.#innerResponse = response.response
    this.#innerOutput = response.output
    this.#command = bedrockCommand

    const json = new TextDecoder().decode(this.#innerOutput.body)
    this.#parsedBody = JSON.parse(json)

    const cmd = this.#command
    const body = this.#parsedBody
    if (cmd.isAi21() === true) {
      this.#completions = body.completions?.map((c) => c.data.text) ?? []
      this.#id = body.id
    } else if (cmd.isClaude() === true) {
      // TODO: can we make this thing give more than one completion?
      body.completion && this.#completions.push(body.completion)
    } else if (cmd.isCohere() === true) {
      this.#completions = body.generations?.map((g) => g.text) ?? []
      this.#id = body.id
    } else if (cmd.isTitan() === true) {
      this.#completions = body.results?.map((r) => r.outputText) ?? []
    }
  }

  /**
   * The prompt responses returned by the model.
   *
   * @returns {string[]|*[]} Should be an array of string responses to the
   * prompt.
   */
  get completions() {
    return this.#completions
  }

  /**
   * The reason the model has given for finishing the response.
   *
   * @returns {string|*}
   */
  get finishReason() {
    const cmd = this.#command
    let result
    if (cmd.isAi21() === true) {
      result = this.#parsedBody.completions?.[0]?.finishReason.reason
    } else if (cmd.isClaude() === true) {
      result = this.#parsedBody.stop_reason
    } else if (cmd.isCohere() === true) {
      result = this.#parsedBody.generations?.[0].finish_reason
    } else if (cmd.isTitan() === true) {
      result = this.#parsedBody.results?.[0]?.completionReason
    }
    return result
  }

  /**
   * HTTP headers provided in the API response.
   *
   * @returns {object} Typical key-value set of HTTP headers.
   */
  get headers() {
    return this.#innerResponse.headers
  }

  /**
   * Retrieve the response identifier provided by some model responses.
   *
   * @returns {string|undefined}
   */
  get id() {
    return this.#id
  }

  /**
   * The number of tokens present in the prompt as determined by the remote
   * API.
   *
   * @returns {number}
   */
  get inputTokenCount() {
    return parseInt(this.headers?.['x-amzn-bedrock-input-token-count'] || 0, 10)
  }

  /**
   * The number of tokens in the LLM response as determined by the remote API.
   *
   * @returns {number}
   */
  get outputTokenCount() {
    return parseInt(this.headers?.['x-amzn-bedrock-output-token-count'] || 0, 10)
  }

  /**
   * UUID assigned to the initial request as returned by the API.
   *
   * @returns {string}
   */
  get requestId() {
    return this.#innerOutput.requestId
  }

  /**
   * The HTTP status code of the response.
   *
   * @returns {number}
   */
  get statusCode() {
    return this.#innerResponse.statusCode
  }
}

module.exports = BedrockResponse