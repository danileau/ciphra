"""
ciphra — E2E Encryption Module
Argon2id key derivation + AES-256-GCM
Ported from epi-2 PoC with production fixes.
"""

import os
import json
import secrets
import base64
from typing import Optional, Tuple
from dataclasses import dataclass
from datetime import datetime, timezone

from argon2 import PasswordHasher, Type
from argon2.low_level import hash_secret_raw, Type
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend


@dataclass
class UserVault:
    username: str
    auth_hash: str
    vault_params: str
    encrypted_master: str
    recovery_vault: Optional[str] = None
    recovery_params: Optional[str] = None


class Argon2KeyDerivation:
    def __init__(self):
        self.hasher = PasswordHasher(
            type=Type.ID,
            memory_cost=65536,
            time_cost=3,
            parallelism=4,
        )
        self.kdf_params = {
            'memory_cost': 65536,
            'time_cost': 3,
            'parallelism': 4,
            'hash_len': 32,
            'type': Type.ID.name,
        }

    def hash_password(self, password: str) -> str:
        return self.hasher.hash(password)

    def verify_password(self, password: str, hash_str: str) -> bool:
        try:
            return self.hasher.verify(hash_str, password)
        except Exception:
            return False

    def derive_key(self, password: str, salt: bytes, context: str = "") -> bytes:
        kdf = self.kdf_params.copy()
        t = kdf.pop('type')
        type_enum = getattr(Type, t, Type.ID) if isinstance(t, str) else t
        return hash_secret_raw(
            secret=(password + context).encode('utf-8'),
            salt=salt,
            time_cost=kdf['time_cost'],
            memory_cost=kdf['memory_cost'],
            parallelism=kdf['parallelism'],
            hash_len=kdf.get('hash_len', 32),
            type=type_enum,
        )

    def generate_salt(self) -> bytes:
        return os.urandom(32)

    def encode_params(self, salt: bytes) -> str:
        params = {**self.kdf_params, 'salt': base64.b64encode(salt).decode('ascii')}
        return base64.b64encode(json.dumps(params).encode('utf-8')).decode('ascii')

    def decode_params(self, encoded: str) -> Tuple[bytes, dict]:
        params = json.loads(base64.b64decode(encoded).decode('utf-8'))
        salt = base64.b64decode(params.pop('salt'))
        return salt, params


class AESCipher:
    @staticmethod
    def encrypt(data: bytes, key: bytes) -> bytes:
        nonce = os.urandom(12)
        cipher = Cipher(algorithms.AES(key), modes.GCM(nonce), backend=default_backend())
        encryptor = cipher.encryptor()
        ciphertext = encryptor.update(data) + encryptor.finalize()
        return nonce + encryptor.tag + ciphertext

    @staticmethod
    def decrypt(encrypted_data: bytes, key: bytes) -> bytes:
        if len(encrypted_data) < 28:
            raise ValueError("Invalid encrypted data")
        nonce = encrypted_data[:12]
        tag = encrypted_data[12:28]
        ciphertext = encrypted_data[28:]
        cipher = Cipher(algorithms.AES(key), modes.GCM(nonce, tag), backend=default_backend())
        decryptor = cipher.decryptor()
        return decryptor.update(ciphertext) + decryptor.finalize()


class RecoveryCode:
    WORDLIST = [
        "able", "acid", "aged", "also", "area", "army", "away", "baby", "back", "ball",
        "band", "bank", "base", "bath", "bear", "beat", "been", "beer", "bell", "belt",
        "best", "bill", "bird", "blow", "blue", "boat", "body", "bomb", "bond", "bone",
        "book", "boot", "born", "boss", "both", "bowl", "bulk", "burn", "bush", "busy",
        "call", "calm", "came", "camp", "card", "care", "case", "cash", "cast", "cell",
        "chat", "chip", "city", "club", "coal", "coat", "code", "cold", "come", "cook",
        "cool", "copy", "core", "cost", "crew", "crop", "dark", "data", "date", "dawn",
        "days", "dead", "deal", "dean", "dear", "debt", "deep", "deny", "desk", "dial",
        "diet", "dirt", "dish", "disk", "does", "done", "door", "dose", "down", "draw",
        "drew", "drop", "drug", "dual", "duke", "dust", "duty", "each", "earn", "ease",
        "east", "easy", "edge", "else", "even", "ever", "evil", "exit", "face", "fact",
        "fail", "fair", "fall", "farm", "fast", "fate", "fear", "feed", "feel", "feet",
        "fell", "felt", "file", "fill", "film", "find", "fine", "fire", "firm", "fish",
        "five", "flat", "flow", "folk", "food", "foot", "form", "fort", "four", "free",
        "from", "fuel", "full", "fund", "gain", "game", "gate", "gave", "gear", "gift",
        "girl", "give", "glad", "goal", "goes", "gold", "golf", "gone", "good", "gray",
        "grew", "grid", "grip", "grow", "gulf", "hair", "half", "hall", "hand", "hang",
        "hard", "harm", "hate", "have", "head", "hear", "heat", "held", "hell", "help",
        "here", "hero", "high", "hill", "hint", "hire", "hold", "hole", "holy", "home",
        "hope", "host", "hour", "huge", "hung", "hunt", "hurt", "idea", "inch", "into",
        "iron", "item", "jack", "jane", "jean", "john", "join", "jump", "june", "jury",
        "just", "keen", "keep", "kent", "kept", "kick", "kill", "kind", "king", "knee",
        "knew", "know", "lack", "lady", "laid", "lake", "land", "lane", "last", "late",
        "lead", "left", "less", "life", "lift", "like", "line", "link", "list", "live",
        "load", "loan", "lock", "logo", "long", "look", "lord", "lose", "loss", "lost",
        "love", "luck", "made", "mail", "main", "make", "male", "many", "mark", "mass",
        "mate", "meal", "mean", "meat", "meet", "menu", "mere", "mike", "mile", "milk",
        "mind", "mine", "miss", "mode", "mood", "moon", "more", "most", "move", "much",
        "must", "name", "navy", "near", "neck", "need", "news", "next", "nice", "nick",
        "nine", "none", "noon", "nose", "note", "nova", "okay", "once", "only", "open",
    ]

    @classmethod
    def generate(cls, word_count: int = 12) -> str:
        words = [secrets.choice(cls.WORDLIST) for _ in range(word_count - 1)]
        checksum_index = sum(cls.WORDLIST.index(w) for w in words) % len(cls.WORDLIST)
        words.append(cls.WORDLIST[checksum_index])
        return " ".join(words)

    @classmethod
    def validate(cls, recovery_string: str) -> bool:
        words = recovery_string.lower().strip().split()
        if len(words) != 12:
            return False
        if not all(word in cls.WORDLIST for word in words):
            return False
        checksum_index = sum(cls.WORDLIST.index(w) for w in words[:-1]) % len(cls.WORDLIST)
        return words[-1] == cls.WORDLIST[checksum_index]


class E2EEncryption:
    def __init__(self):
        self.argon2 = Argon2KeyDerivation()
        self.cipher = AESCipher()

    def register_user(self, username: str, password: str,
                      enable_recovery: bool = True) -> Tuple[UserVault, Optional[str]]:
        master_key = os.urandom(32)
        auth_hash = self.argon2.hash_password(password)

        vault_salt = self.argon2.generate_salt()
        vault_key = self.argon2.derive_key(password, vault_salt, ":VAULT")
        vault_params = self.argon2.encode_params(vault_salt)
        encrypted_master = base64.b64encode(
            self.cipher.encrypt(master_key, vault_key)
        ).decode('ascii')

        recovery_vault = None
        recovery_params = None
        recovery_code = None

        if enable_recovery:
            recovery_code = RecoveryCode.generate()
            recovery_salt = self.argon2.generate_salt()
            recovery_key = self.argon2.derive_key(
                recovery_code, recovery_salt, f":{username}:RECOVERY"
            )
            recovery_params = self.argon2.encode_params(recovery_salt)
            recovery_vault = base64.b64encode(
                self.cipher.encrypt(master_key, recovery_key)
            ).decode('ascii')

        vault = UserVault(
            username=username,
            auth_hash=auth_hash,
            vault_params=vault_params,
            encrypted_master=encrypted_master,
            recovery_vault=recovery_vault,
            recovery_params=recovery_params,
        )
        return vault, recovery_code

    def verify_login(self, password: str, vault: UserVault) -> bool:
        return self.argon2.verify_password(password, vault.auth_hash)
