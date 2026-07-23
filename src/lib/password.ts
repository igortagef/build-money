import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

/**
 * `promisify` perde a sobrecarga do scrypt que aceita opções, então a
 * promessa é montada à mão para manter N/r/p tipados.
 */
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// Custo de CPU/memória. 2^16 leva ~100ms, o que torna força bruta cara
// sem atrapalhar o login.
const COST = 65536;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const MAX_MEMORY = 128 * COST * BLOCK_SIZE * 2;

/** Gera o hash de uma senha. Formato: scrypt$N$r$p$salt$hash (tudo em hex). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(
    password.normalize("NFKC"),
    salt,
    KEY_LENGTH,
    { N: COST, r: BLOCK_SIZE, p: PARALLELIZATION, maxmem: MAX_MEMORY },
  );

  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString("hex"),
    derived.toString("hex"),
  ].join("$");
}

/**
 * Confere a senha contra o hash guardado. A comparação é feita em tempo
 * constante para não vazar informação pelo tempo de resposta.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  try {
    const [scheme, n, r, p, saltHex, hashHex] = stored.split("$");
    if (scheme !== "scrypt") return false;

    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");

    const derived = await scryptAsync(
      password.normalize("NFKC"),
      salt,
      expected.length,
      {
        N: Number(n),
        r: Number(r),
        p: Number(p),
        maxmem: 128 * Number(n) * Number(r) * 2,
      },
    );

    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
