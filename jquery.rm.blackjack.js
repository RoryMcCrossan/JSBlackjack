// BlackJack rules: http://www.pagat.com/banking/blackjack.html

// TODO:
//		betting (2:1 payout, blackjack pays 3:2)
//			blackjack = 2:3 (stake * 1.5 + stake)
//			
//		insurance (available if dealer dealt an ace)
//			costs stake * 0.5, blackjack pays 2:1
//		split (separate cards, play each individually, no blackjack, splitting aces allows one card only)
//			payout becomes 1:1
//		basic ai

// VARIATIONS:
//		blackjack pays 6:5 (stake * 1.2 + stake)
//		double limited to hard 10 or 11 only
//		double after a split

// BUGS:
// 		P2 sometimes skipped when P1 gets a natural 21
//		Soft blackjack not showing correctly in hand total (ie. still shows '11/21')

(function($){
	function Blackjack(el, opts) {
		var _bj = this;
		
		//Defaults:
		_bj.defaults = {
			startingChips: 1000,
			minBet: 10,
			decksUsed: 6,
			deckPenetration: 75, // %
			dealerStandOnSoftLimit: true, // true makes it easier for players
			dealerLimit: 17
		};

		//Extending options:
		_bj.options = $.extend({}, _bj.defaults, opts);

		//Privates:
		_bj.$table = $(el);
		_bj.$stacks = $('.stack', _bj.$table);
		_bj.$dealButton = $('.deal-button', _bj.$table);
		_bj.$shoe = $('.card-shoe', _bj.$table);
		_bj.deck = [];
		_bj.deckPosition = 0;
		_bj.currentPlayerIndex = 0;
		_bj.blackJackValue = 21;
		_bj.dealSpeed = 150;
		_bj.dealer = {};
		_bj.players = [];
		_bj.queue = 'bjQueue';
		
		// EVENTS ======================================================================================================
		
		_bj.hookupEvents = function() {
			$('.hit-button', _bj.$table).on('click', function() {
				_bj.players[_bj.currentPlayerIndex].hit();
			});

			$('.stand-button', _bj.$table).on('click', function() {
				_bj.players[_bj.currentPlayerIndex].stand();
			});

			$('.double-button', _bj.$table).on('click', function() {
				_bj.players[_bj.currentPlayerIndex].double();
			});

			_bj.$dealButton.on('click', function() {
				_bj.deal();
				_bj.players[_bj.currentPlayerIndex].checkState();
			});
		}
		
		// DECKS ======================================================================================================
		
		_bj.generateDecks = function(decks) {
			var ranks = [
					{ key: 'A', label: 'Ace', value: [1, 11] },
					{ key: '2', label: 'Two', value: [2] }, 
					{ key: '3', label: 'Three', value: [3] }, 
					{ key: '4', label: 'Four', value: [4] }, 
					{ key: '5', label: 'Five', value: [5] }, 
					{ key: '6', label: 'Six', value: [6] },
					{ key: '7', label: 'Seven', value: [7] }, 
					{ key: '8', label: 'Eight', value: [8] }, 
					{ key: '9', label: 'Nine', value: [9] }, 
					{ key: '10', label: 'Ten', value: [10] }, 
					{ key: 'J', label: 'Jack', value: [10] }, 
					{ key: 'Q', label: 'Queen', value: [10] }, 
					{ key: 'K', label: 'King', value: [10] }
				],
				suits = [
					{ key: 'C', label: 'Clubs' }, 
					{ key: 'D', label: 'Diamonds' }, 
					{ key: 'H', label: 'Hearts' }, 
					{ key: 'S', label: 'Spades' }
				],
				cardCount = ranks.length * suits.length,
				cards = new Array(decks * cardCount);
				
			for (var deckCount = 0; deckCount < decks; deckCount++) {
				for (var suitCount = 0; suitCount < suits.length; suitCount++) {
					for (var rankCount = 0; rankCount < ranks.length; rankCount++) {
						cards[deckCount * cardCount + suitCount * ranks.length + rankCount] = new _bj.card(ranks[rankCount], suits[suitCount]);
					}
				}
			}
			
			_bj.deckPosition = 0;
			_bj.deck = cards;
		}
		
		_bj.shuffleDeck = function(shuffles) {			
			if (!_bj.deck.length) {
				alert('No cards in the deck to shuffle');
				return;
			}
			
			for (var shuffleCount = 0; shuffleCount < shuffles; shuffleCount++) {
				for (var cardCount = 0; cardCount < _bj.deck.length; cardCount++) {
					var randomCardIndex = Math.floor(Math.random() * _bj.deck.length)
					var currentCard = _bj.deck[cardCount];
					_bj.deck[cardCount] = _bj.deck[randomCardIndex];
					_bj.deck[randomCardIndex] = currentCard;
				}
			}
		}
		
		// UTILS ======================================================================================================
		
		_bj.utils = {
			groupNumber: function(number) {
				var str = number.toString().split('.');
				if (str[0].length >= 4) {
					str[0] = str[0].replace(/(\d)(?=(\d{3})+$)/g, '$1,');
				}
				if (str[1] && str[1].length >= 5) {
					str[1] = str[1].replace(/(\d{3})/g, '$1 ');
				}
				return str.join('.');
			}
		}
		
		// UI ======================================================================================================
		
		_bj.ui = {
			dealCard: function(card, player) {
				var $playerCard = card.displayElement(true).addClass('hide').appendTo(player.$cardList);
				var $shoeCard = card.displayElement(true).appendTo(_bj.$shoe);
				
				// wait for card to be appended to DOM before retrieving positions.
				setTimeout(function() {					
					$shoeCard.addClass('deal-spin').animate({
						top: $playerCard.offset().top - _bj.$shoe.offset().top,
						left: $playerCard.offset().left - _bj.$shoe.offset().left
					}, 500, function() {
						$(this).remove();
						$playerCard.removeClass('hide');
					});
				}, 10);
			},
			update: function() {
				_bj.$table.dequeue(_bj.queue);
			},
			updateHandInfo: function(player) {
				var handTotal = player.handTotal();
				var handDisplayText = '';
				player.$stack.removeClass('blackjack bust win push');
				
				if (player.hasBlackjack()) {
					player.$stack.addClass('blackjack');
					handDisplayText = player.bestHand();
				}
				else if (player.isBust()) {
					player.$stack.addClass('bust');
					handDisplayText = 'Bust';
				}
				else {
					handDisplayText = (player.hasStood || (player.bestHand == _bj.blackJackValue) || (player.isDealer && player.hand.length > 1)) ? player.bestHand() : player.handTotal().join(' / ');
				}
				
				player.$handDisplay.text(handDisplayText).fadeIn();
			},
			updateDebug: function() {
				$('#deck-position span').text(_bj.deckPosition + 1);
				$('#deck-position-pc span').text(((100 / _bj.deck.length) * _bj.deckPosition).toFixed(2) + '%');
			},
			addToQueue: function(func) {
				_bj.$table.queue(_bj.queue, function() {
					func();
					setTimeout(function() {
						_bj.$table.dequeue(_bj.queue);
					}, _bj.dealSpeed);
				});
			}
		}
		
		// CARDS ======================================================================================================
		
		_bj.card = function(rank, suit) {
			var _card = this;
			_card.rank = rank;
			_card.suit = suit;
			_card.value = _card.rank.value;
			_card.faceUp = true; // is the card value visible
			
			_card.privateName = function() {			
				return _card.rank.label + " of " + _card.suit.label;
			}
			
			_card.publicName = function() {
				return _card.faceUp ? _card.privateName() : '[###] (' + _card.privateName + ')'
			}
			
			_card.displayElement = function() {
				return $('<div />', {
					class: 'card',
					alt: _card.privateName,
					title: _card.privateName
				}).css('background-image', 'url("imagery/cards/' + _card.suit.key + _card.rank.key + '.png")');
			}
		}

		// PLAYERS ======================================================================================================
		
		_bj.player = function(name, isDealer, $stack) {
			var _player = this;
			_player.name = name;
			_player.hand = [];
			_player.chips = _bj.options.startingChips;
			_player.isDealer = isDealer;
			_player.$stack = $stack;
			_player.$cardList = $('.card-list', _player.$stack);
			_player.$handDisplay = $('.hand-display', _player.$stack);
			_player.hasStood = false;
			_player.hasDoubled = false;
			
			_player.init = function() {			
				$('.player-name', _player.$stack).text(_player.name);
				$('.chips', _player.$stack).text(_bj.utils.groupNumber(_player.chips));
			}

			_player.handTotal = function() {
				var cardTotals = [0];
				var handContainsAce = false;

				$.each(_player.hand, function(i, card) {
					if (card.value.length > 1)
						handContainsAce = true;
					cardTotals[0] += card.value[0];
				});

				if (handContainsAce && cardTotals[0] < _bj.blackJackValue) {
					var aceTotal = cardTotals[0] + 10;
					if (aceTotal <= _bj.blackJackValue) {
						cardTotals.push(aceTotal);
					}
				}

				return cardTotals;
			}
			
			_player.canDouble = function() {
				return _player.hand.length == 2 || [9, 10, 11].indexOf(_player.bestHand()) != -1;
			}
			
			_player.canSplit = function() {
				return _player.hand.length == 2 && _player.hand[0].key == _player.hand[1].key;
			}
			
			_player.isBust = function() {
				return _player.handTotal()[0] > _bj.blackJackValue;
			}
			
			_player.hasBlackjack = function() {
				return _player.hand.length == 2 && _player.handTotal()[1] == _bj.blackJackValue; // if there is an ace there will be two hand totals, the second being the highest.
			}

			_player.bestHand = function() {
				return _player.handTotal()[_player.handTotal().length -1];
			}

			_player.hit = function() {
				_player.dealCard();
				_bj.ui.addToQueue(function() {
					// allow animation to run before updating totals
					setTimeout(function() {
						_player.updateHandInfo(_player);
						_player.checkState();
					}, 400);
				});
				_bj.ui.update();
			}
			
			_player.double = function() {
				// TODO: take another stake
				_player.hasDoubled = true;
				_player.hit();
			}

			_player.stand = function() {
				_player.hasStood = true;
				_player.updateHandInfo(_player);
				_player.checkState();
			}
			
			_player.dealCard = function(showImmediately) {
				var card = _bj.takeCard(0, true);
				_player.hand.push(card);
				_bj.ui.addToQueue(function() {
					_bj.ui.dealCard(card, _player)
				});
				showImmediately && _bj.ui.update();
			}

			_player.checkState = function() {
				$('.double-button', _player.$stack)[_player.canDouble() ? 'fadeIn' : 'fadeOut']();
				var isBust = _player.isBust();				
				if (_player.hasBlackjack() || isBust || _player.hasStood || _player.hasDoubled || _player.bestHand() == _bj.blackJackValue) {
					if (_player.isDealer) {
						_bj.finaliseHand();
					}
					else {	
						isBust && _player.setResult('loss');
						_bj.moveToNextPlayer();
					}
				}
				else {
					_player.giveAction()
				}
			}
			
			_player.updateHandInfo = function() {
				_bj.ui.updateHandInfo(_player);
			}

			_player.clearHand = function() {
				_player.$stack.removeClass('blackjack bust win push loss');
				_player.$handDisplay.text('').hide();
				_player.$cardList.empty();
				_player.hand = [];
				_player.hasStood = false;
				_player.hasDoubled = false;
			}
		
			_player.giveAction = function() {
				_bj.hideHandControls();
				_player.$stack.addClass('active').siblings().removeClass('active');
				$('.hand-controls', _player.$stack).stop().fadeIn();	
			}

			_player.setResult = function(result) {
				// payout...
				switch (result) {
					case 'win': 
						_player.$stack.addClass('win');
						break;
					case 'push': 
						_player.$stack.addClass('push');
						break;
					case 'loss':
						_player.$stack.addClass('loss');
						break;
				}
			}
			
			_player.init();
		}
			
		_bj.setupPlayers = function() {
			_bj.dealer = new _bj.player('Dealer', true, $('#dealer-stack'));
			_bj.players = [
				new _bj.player('Rory', false, $('#p0-stack')),
				new _bj.player('Heidi', false, $('#p1-stack')),
				new _bj.player('Caitlin', false, $('#p2-stack')),
				new _bj.player('Tom', false, $('#p3-stack')),
				new _bj.player('Ed', false, $('#p4-stack'))
			];
		}

		_bj.moveToNextPlayer = function() {
			_bj.currentPlayerIndex++;
			if (_bj.currentPlayerIndex < _bj.players.length) {
				if (_bj.players[_bj.currentPlayerIndex].hasBlackjack()) {
					_bj.moveToNextPlayer();
				}
				else {
					_bj.players[_bj.currentPlayerIndex].checkState();
				}
			}
			else {
				_bj.hideHandControls();
				_bj.dealer.giveAction();
				setTimeout(function() {
					_bj.playDealerHand();
				}, 1000);
			}
		}

		_bj.playDealerHand = function() {
			drawDealerCard();

			function drawDealerCard() {
				var dealer = _bj.dealer;
				dealer.hit();
				var handTotals = _bj.dealer.handTotal();
				var handTotal = handTotals[handTotals.length -1];
				var hasSoftLimit = handTotals.length > 1 && dealer.hand.length >= 2 && handTotal == _bj.options.dealerLimit;

				if ((hasSoftLimit && _bj.options.dealerStandOnSoftLimit) || (handTotal >= _bj.options.dealerLimit && !hasSoftLimit) || dealer.isBust()) {
					setTimeout(_bj.finaliseHand, 1500);
				}
				else {
					setTimeout(drawDealerCard, 1500);
				}
			}
		}

		_bj.finaliseHand = function() {
			var _dealer = _bj.dealer;
			_dealer.$stack.removeClass('active');
			var dealerHandScore = _dealer.bestHand();
			_dealer.hasBlackjack() && _dealer.$stack.addClass('win');

			$.each(_bj.players, function(i, player) {
				if (player.isBust())
					return;
				
				var playerHandScore = player.bestHand();
				var result = '';
				if (player.hasBlackjack()) {
					result = _dealer.hasBlackjack() ? 'push' : 'win'
				}
				else if (!_dealer.hasBlackjack()) {
					if (playerHandScore == dealerHandScore && !player.isBust()) {
						result = 'push';
					}
					else if (playerHandScore > dealerHandScore || _dealer.isBust()) {
						result = 'win';
					}
					else {
						result = 'loss';
					}
				}

				player.setResult(result);
			});

			setTimeout(function() {
				_bj.$dealButton.stop(true, true).fadeIn();
			}, 2000);
		} 
		
		_bj.deal = function() {
			_bj.clearHands();		
			_bj.$dealButton.stop(true, true).fadeOut();	
			_bj.currentPlayerIndex = 0;
			var deckProgressPC = ((100 / _bj.deck.length) * _bj.deckPosition).toFixed(2);
			if (!_bj.deck.length || deckProgressPC >= _bj.options.deckPenetration) {
				_bj.generateDecks(_bj.options.decksUsed);
				_bj.shuffleDeck(10);
			}
			
			// dealer
			_bj.dealer.dealCard();
			_bj.ui.addToQueue(function() {
				setTimeout(function() {
					_bj.dealer.updateHandInfo(_bj.dealer);
				}, 400);
			});
			
			// players
			for (var holeCount = 0; holeCount < 2; holeCount++) {
				for (var playerIndex = 0; playerIndex < _bj.players.length; playerIndex++) {
					_bj.players[playerIndex].dealCard();
				}
			}
			
			_bj.ui.addToQueue(function() {
				$.each(_bj.players, function(i, player) {
					setTimeout(function() {
						player.updateHandInfo(player);
					}, 400);
				});
				_bj.players[0].checkState();
			});
			
			_bj.ui.update();
		}

		_bj.takeCard = function(muckCount, faceUp) {
			_bj.deckPosition += muckCount || 0;
			var card = _bj.deck[_bj.deckPosition];
			card.faceUp = faceUp;
			_bj.deckPosition++;
			_bj.ui.updateDebug();
			return card;
		}
		
		_bj.clearHands = function() {
			_bj.dealer.clearHand()
			$.each(_bj.players, function(i, player) {
				player.clearHand();
			});
		}
		
		_bj.hideHandControls = function() {
			$('.hand-controls').stop().fadeOut();
		}
	}

	// Separate functionality from object creation
	Blackjack.prototype = {
		init: function() {
			this.hookupEvents();	
			this.setupPlayers();		
			this.deal();
		}
	};

	// The actual plugin
	$.fn.blackJack = function(options) {
		if (this.length) {
			this.each(function() {
				var bj = new Blackjack(this, options);
				bj.init();
				$(this).data('blackJack', bj);
			});
		}
		return this;
	};
})(jQuery);










































